import { z } from 'zod';
import type { ChatMessage, OnboardingSkeletonReason } from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { TimeoutError } from '../../platform/resilience.js';
import type { RepoFacts } from '../repo-intel/index.js';
import { isCandidateCommand, normalizeCwd, type TourSections } from './model.js';
import {
  BODY_MAX, COMMAND_MAX, DIAGRAM_MAX, FIRST_TASKS_MAX, HOW_TO_RUN_MAX, MAX_INPUT_TOKENS,
  PROMPT_README_TOKENS, PROMPT_ROUTES_MAX, REASON_MAX, TITLE_MAX, UNTRUSTED_LABELS,
} from './constants.js';

/** What the single LLM call must return (parsed at the provider edge). */
export const TourLlmOutput = z.object({
  architecture: z.object({ body: z.string(), diagram: z.string().nullable() }),
  critical_path_reasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  reading_path_reasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  how_to_run: z.array(
    z.object({
      command: z.string(),
      comment: z.string().nullable(),
      cwd: z.string().nullable(),
    }),
  ),
  first_tasks: z.array(
    z.object({
      title: z.string(),
      scope_path: z.string(),
      complexity: z.enum(['Low', 'Medium', 'High']),
    }),
  ),
});
export type TourLlmOutput = z.infer<typeof TourLlmOutput>;

/** False for absolute paths, `..` segments and control characters (AC-61). */
export function isSafeRepoPath(p: string): boolean {
  if (!p || p.startsWith('/')) return false;
  if (p.split('/').includes('..')) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(p);
}

export function groundOutput(
  out: TourLlmOutput,
  skeleton: TourSections,
  facts: RepoFacts,
  scopeExists: (path: string) => boolean,
): { sections: TourSections; dropped: number } {
  let dropped = 0;

  const pickReasons = (list: { path: string; reason: string }[], listed: Set<string>) => {
    const first = new Map<string, string>();
    for (const r of list) {
      if (!isSafeRepoPath(r.path)) dropped++;
      else if (listed.has(r.path) && r.reason.trim() && !first.has(r.path)) {
        first.set(r.path, r.reason.slice(0, REASON_MAX));
      }
    }
    return first;
  };
  const crit = pickReasons(out.critical_path_reasons, new Set(skeleton.critical_paths.map((i) => i.path)));
  const read = pickReasons(out.reading_path_reasons, new Set(skeleton.reading_path.map((i) => i.path)));

  let diagram = out.architecture.diagram || null;
  if (diagram && diagram.length > DIAGRAM_MAX) {
    diagram = null;
    dropped++;
  }

  const commands: TourSections['how_to_run'] = [];
  for (const c of out.how_to_run) {
    const cwd = normalizeCwd(c.cwd);
    const command = c.command.trim().replace(/\s+/g, ' ');
    const canon =
      (cwd !== null && !isSafeRepoPath(cwd)) || command.length > COMMAND_MAX
        ? false
        : isCandidateCommand(facts, command, cwd);
    if (canon === false) dropped++;
    else commands.push({ command, comment: c.comment?.slice(0, COMMAND_MAX) ?? null, cwd: canon });
  }
  dropped += Math.max(0, commands.length - HOW_TO_RUN_MAX);

  const tasks: TourSections['first_tasks'] = [];
  for (const t of out.first_tasks) {
    if (isSafeRepoPath(t.scope_path) && scopeExists(t.scope_path)) {
      tasks.push({ title: t.title.slice(0, TITLE_MAX), scope_path: t.scope_path, complexity: t.complexity });
    } else dropped++;
  }
  dropped += Math.max(0, tasks.length - FIRST_TASKS_MAX);

  return {
    dropped,
    sections: {
      architecture: { body: out.architecture.body.slice(0, BODY_MAX), diagram },
      critical_paths: skeleton.critical_paths.map((i) => ({ ...i, reason: crit.get(i.path) ?? i.reason })),
      reading_path: skeleton.reading_path.map((i) => ({ ...i, reason: read.get(i.path) ?? i.reason })),
      how_to_run: commands.length ? commands.slice(0, HOW_TO_RUN_MAX) : skeleton.how_to_run,
      first_tasks: tasks.slice(0, FIRST_TASKS_MAX),
    },
  };
}

export function buildPrompt(
  facts: RepoFacts,
  skeleton: TourSections,
  system: string,
  tokenizer: { count(s: string): number; truncate(s: string, n: number): string },
): { messages: ChatMessage[]; inputTokens: number } {
  const L = UNTRUSTED_LABELS;
  const { scripts, stack } = facts;
  const lines = (xs: { path: string; reason: string }[]) => xs.map((x) => `- ${x.path}: ${x.reason}`).join('\n');
  const manifests = scripts.manifests.map((m) => `- ${m.dir ?? '.'}: ${m.scripts.join(', ')}`).join('\n');
  const candidates = [...skeleton.how_to_run.map((c) => c.command), ...scripts.readmeCommands].join('\n');
  // Priority order (EC-7): later blocks are the first dropped.
  const blocks: [string, string][] = [
    [L.reading_path, lines(skeleton.reading_path)],
    [L.critical_paths, lines(skeleton.critical_paths)],
    [
      L.facts,
      `Scripts by manifest:\n${manifests}\nMake targets: ${scripts.makeTargets.join(', ')}\n` +
        `Compose services: ${scripts.composeServices.join(', ')}\nEnv var names: ${scripts.envExampleNames.join(', ')}\n` +
        `Candidate commands:\n${candidates}`,
    ],
    [
      L.facts,
      `Languages: ${stack.languages.map((l) => `${l.ext} (${l.files})`).join(', ')}\n` +
        `Package manager: ${stack.packageManager ?? 'none'}\nFrameworks: ${stack.frameworks.join(', ')}\n` +
        `Structure:\n${facts.structure.map((d) => `- ${d.dir} (${d.files})`).join('\n')}`,
    ],
    [L.routes, facts.routes.slice(0, PROMPT_ROUTES_MAX).join('\n')],
    [L.readme, tokenizer.truncate(facts.readme.text ?? '', PROMPT_README_TOKENS)],
    [L.repo_map, facts.repoMap],
  ];

  const total = (user: string) => tokenizer.count(`${system}\n${user}`);
  let user = '';
  for (const [label, text] of blocks) {
    if (!text.trim()) continue;
    const join = (t: string) => (user ? `${user}\n\n` : '') + wrapUntrusted(label, t);
    if (total(join(text)) <= MAX_INPUT_TOKENS) {
      user = join(text);
      continue;
    }
    // First block that does not fit: truncate its text to what is left, drop the rest.
    let n = MAX_INPUT_TOKENS - total(join(''));
    for (let i = 0; i < 5 && n > 0; i++) {
      const excess = total(join(tokenizer.truncate(text, n))) - MAX_INPUT_TOKENS;
      if (excess <= 0) break;
      n -= excess;
    }
    if (n > 0) user = join(tokenizer.truncate(text, n));
    break;
  }

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    inputTokens: total(user),
  };
}

export function classifyLlmError(err: unknown): OnboardingSkeletonReason {
  const e = err as { name?: unknown; status?: unknown; message?: unknown } | null;
  const name = typeof e?.name === 'string' ? e.name : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  if (err instanceof TimeoutError || name.includes('Timeout')) return 'timeout';
  if (e?.status === 429) return 'rate_limited';
  if (err instanceof ConfigError && message.includes('API_KEY')) return 'no_api_key';
  if (err instanceof z.ZodError || name === 'ZodError' || /schema validation|no choices|JSON/i.test(message)) return 'invalid_output';
  return 'provider_error';
}
