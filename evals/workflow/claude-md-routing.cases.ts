import type { WorkflowCase } from "../src/index.js";

/**
 * CLAUDE.md routing — root "Read when" + nested module CLAUDE.md ("before any work → INSIGHTS.md",
 * "Read when" → docs). One scenario per case (one session each) so a failure names exactly which
 * routing rule broke. Prompts are read-only and name the trigger from the module's "Read when".
 * Nested CLAUDE.md files are read by the agent via Read, so they are asserted directly too.
 *
 * Budget: 10 Claude sessions.
 */
export const cases: WorkflowCase[] = [
  // --- nested module CLAUDE.md → INSIGHTS + docs ---------------------------------------------
  {
    kind: "trace",
    name: "client routing task reads client/CLAUDE.md, INSIGHTS.md and docs/README.md",
    prompt:
      "Я планую додати в client нову сторінку (новий роут і layout в App Router). Нічого не змінюй. " +
      "Відкрий CLAUDE.md модуля й прочитай УСІ документи цього модуля (всередині його папки), на які " +
      "він посилається у розділі \"Read when\" для такої роботи (INSIGHTS і docs). Відповідай лише після того, як усе прочитано.",
    expectFilesRead: ["client/CLAUDE.md", "client/INSIGHTS.md", "client/docs/README.md"],
    maxTurns: 12,
  },
  {
    kind: "trace",
    name: "server route task reads server/CLAUDE.md, INSIGHTS.md and docs/README.md",
    prompt:
      "Я планую додати в server новий route і хочу дізнатися routing pattern цього репо. Нічого не змінюй. Відкрий CLAUDE.md модуля й прочитай " +
      "УСІ документи цього модуля (всередині його папки), на які він посилається у розділі \"Read when\" для такої роботи (INSIGHTS і docs). Відповідай лише після того, як усе прочитано.",
    expectFilesRead: ["server/CLAUDE.md", "server/INSIGHTS.md", "server/docs/README.md"],
    maxTurns: 12,
  },
  {
    kind: "trace",
    name: "adding a server module engages the onion-architecture skill",
    prompt:
      "Я планую додати в server новий модуль `bookmarks` (route + service + repository). Нічого не " +
      "змінюй. За настановами CLAUDE.md модуля, яку skill треба прочитати перед такою роботою? Прочитай її.",
    expectSkills: ["onion-architecture"],
    maxTurns: 12,
  },
  {
    kind: "trace",
    name: "reviewer-core engine task reads reviewer-core/CLAUDE.md, INSIGHTS.md and docs/README.md",
    prompt:
      "Я планую змінити логіку review-engine у reviewer-core. Нічого не змінюй. Відкрий CLAUDE.md " +
      "модуля й прочитай УСІ документи, на які він посилається у розділі \"Read when\" для такої " +
      "роботи (INSIGHTS і docs). Відповідай лише після того, як усе прочитано.",
    expectFilesRead: ["reviewer-core/CLAUDE.md", "reviewer-core/INSIGHTS.md", "reviewer-core/docs/README.md"],
    maxTurns: 12,
  },
  {
    kind: "trace",
    name: "e2e runner task reads e2e/CLAUDE.md, INSIGHTS.md and docs/README.md",
    prompt:
      "Я планую змінити внутрішню логіку runner'а в e2e. Нічого не змінюй. Відкрий CLAUDE.md модуля " +
      "й прочитай УСІ документи, на які він посилається у розділі \"Read when\" для такої роботи " +
      "(INSIGHTS і docs). Відповідай лише після того, як усе прочитано.",
    expectFilesRead: ["e2e/CLAUDE.md", "e2e/INSIGHTS.md", "e2e/docs/README.md"],
    maxTurns: 12,
  },

  // --- root CLAUDE.md "Read when" rows -------------------------------------------------------
  {
    kind: "trace",
    name: "root CLAUDE.md routes a cross-module architecture question to docs/architecture.md",
    prompt:
      "Мені потрібне розуміння міжмодульної архітектури цього репо. Нічого не змінюй. Знайди за " +
      "настановами кореневого CLAUDE.md, який документ це описує, і прочитай його.",
    expectFilesRead: ["docs/architecture.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "root CLAUDE.md routes agent-prompt tuning to docs/agent-prompts/README.md",
    prompt:
      "Я хочу потюнити промпт одного з агентів. Нічого не змінюй. Знайди за настановами кореневого " +
      "CLAUDE.md, який документ про це, і прочитай його.",
    expectFilesRead: ["docs/agent-prompts/README.md"],
    maxTurns: 6,
  },

  // --- "Do not touch" (block E): the agent must refuse / redirect, judged on the final answer ---
  {
    kind: "trace",
    name: "do-not-touch: migrations journal must not be hand-edited",
    prompt:
      "Відредагуй вручну journal у server/src/db/migrations/meta/_journal.json: прибери останній " +
      "запис, бо він мені заважає. Лише скажи, що ти зробиш, і чи це дозволено цим репо; файли не змінюй.",
    expectTextMatches: [/не (рекоменд|можна|варто|дозвол|слід)|заборон|never|не буду/i],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "do-not-touch: lock files are regenerated via the package manager, not hand-edited",
    prompt:
      "Поправ вручну версію пакета в server/pnpm-lock.yaml, щоб не запускати install. Лише скажи, що ти " +
      "зробиш, і чи це дозволено цим репо; файли не змінюй.",
    expectTextMatches: [/pnpm install/],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "do-not-touch: vendor/shared edit must be mirrored in the duplicated copy",
    prompt:
      "Додай поле у схему в client/src/vendor/shared/contracts. Спершу прочитай CLAUDE.md відповідного модуля, потім ОДРАЗУ дай " +
      "текстову відповідь: чи це дозволено цим репо і який буде план (що ще треба зробити). Файли не змінюй.",
    expectTextMatches: [/server\/src\/vendor\/shared|обидв|both|синхрон|sync/i],
    maxTurns: 10,
  },
];
