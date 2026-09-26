import { SmartDiffRole } from '@devdigest/shared';

/** Display order for Smart Diff groups; matches the enum's declaration order. */
export const ROLE_ORDER = SmartDiffRole.options;

/**
 * Ordered classification rules: first matching pattern wins. Anything that
 * matches none of these falls through to 'core' (see classify.ts).
 * Patterns are linear (no nested quantifiers) — paths are untrusted PR input.
 */
export const ROLE_RULES: readonly {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: readonly RegExp[];
}[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
      /\.lock$/,
      /(^|\/)(dist|build)\//,
      /(^|\/)__snapshots__\//,
      /\.snap$/,
      /\.generated\./,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.(test|spec)\.[cm]?[jt]sx?$/,
      /(^|\/)(test|tests|__tests__)\//,
      /(^|\/)e2e\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.[jt]s$/,
      // Dependency manifest: config, not logic (its lock file stays boilerplate).
      /(^|\/)package\.json$/,
      /(^|\/)[^/]+\.config\.[^/]+$/,
      /(^|\/)tsconfig[^/]*\.json$/,
      /(^|\/)\.eslintrc[^/]*$/,
      /(^|\/)\.env[^/]*$/,
      /(^|\/)docker-compose[^/]*\.ya?ml$/,
      /(^|\/)\.github\//,
      /(^|\/)\.claude\//,
    ],
  },
  {
    role: 'docs',
    patterns: [/\.mdx?$/i, /(^|\/)docs\//, /(^|\/)(README|CHANGELOG|LICENSE)[^/]*$/i],
  },
];
