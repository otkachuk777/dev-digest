import { describe, it, expect } from 'vitest';
import { extractIntentLinks } from '../src/modules/reviews/helpers.js';

const repo = { owner: 'acme', name: 'widgets' };

describe('extractIntentLinks', () => {
  it('extracts a bare #N shorthand as an issue link', () => {
    const links = extractIntentLinks('See #12 for context.', repo, 999);
    expect(links).toEqual([{ kind: 'issue', ref: '#12', number: 12 }]);
  });

  it('extracts Fixes/Closes/Resolves #N as an issue link', () => {
    for (const verb of ['Fixes', 'closes', 'Resolves']) {
      const links = extractIntentLinks(`${verb} #7`, repo, 999);
      expect(links).toEqual([{ kind: 'issue', ref: '#7', number: 7 }]);
    }
  });

  it('extracts a same-repo issue/PR URL as an issue link', () => {
    const links = extractIntentLinks(
      'https://github.com/acme/widgets/issues/42?tab=comments',
      repo,
      999,
    );
    expect(links).toEqual([{ kind: 'issue', ref: '#42', number: 42 }]);
  });

  it('extracts a same-repo blob .md URL as a plan_file link, ignoring the URL ref', () => {
    const links = extractIntentLinks(
      'Plan: https://github.com/acme/widgets/blob/feature-branch/docs/plan.md',
      repo,
      999,
    );
    expect(links).toEqual([{ kind: 'plan_file', ref: 'docs/plan.md', path: 'docs/plan.md' }]);
  });

  it('extracts a bare relative .md path mention as a plan_file link', () => {
    const links = extractIntentLinks('See docs/plan.md for the spec.', repo, 999);
    expect(links).toEqual([{ kind: 'plan_file', ref: 'docs/plan.md', path: 'docs/plan.md' }]);
  });

  it('a cross-repo GitHub issue URL is external, never followed', () => {
    const links = extractIntentLinks('https://github.com/other/repo/issues/1', repo, 999);
    expect(links).toEqual([{ kind: 'external', ref: 'https://github.com/other/repo/issues/1' }]);
  });

  it('a Jira link is external with no query string', () => {
    const links = extractIntentLinks(
      'Ticket: https://jira.example.com/browse/X-1?query=secret',
      repo,
      999,
    );
    expect(links).toEqual([{ kind: 'external', ref: 'https://jira.example.com/browse/X-1' }]);
  });

  it('rejects a path-traversal blob path, treating it as external instead of a plan_file', () => {
    const links = extractIntentLinks(
      'https://github.com/acme/widgets/blob/main/../../etc/passwd.md',
      repo,
      999,
    );
    expect(links).toEqual([
      { kind: 'external', ref: 'https://github.com/acme/widgets/blob/main/../../etc/passwd.md' },
    ]);
  });

  it('extracts a root-level .md file mention (no directory) as a plan_file link', () => {
    const links = extractIntentLinks('Implements the spec: DEMO-ANALYTICS-FEATURE.md', repo, 999);
    expect(links).toEqual([
      { kind: 'plan_file', ref: 'DEMO-ANALYTICS-FEATURE.md', path: 'DEMO-ANALYTICS-FEATURE.md' },
    ]);
  });

  it('a bare ".." relative mention is never extracted as a plan_file', () => {
    const links = extractIntentLinks('See ../../secret.md for details.', repo, 999);
    expect(links.find((l) => l.kind === 'plan_file')).toBeUndefined();
  });

  it('skips the PR own number', () => {
    const links = extractIntentLinks('Follow-up to #5, fixes #5.', repo, 5);
    expect(links).toEqual([]);
  });

  it('dedupes repeated mentions of the same link', () => {
    const links = extractIntentLinks('#12 relates to #12 and #12 again.', repo, 999);
    expect(links).toEqual([{ kind: 'issue', ref: '#12', number: 12 }]);
  });

  it('caps followable links at MAX_INTENT_LINKS(5), downgrading the rest to external', () => {
    const body = '#1 #2 #3 #4 #5 #6 #7';
    const links = extractIntentLinks(body, repo, 999);
    const followable = links.filter((l) => l.kind !== 'external');
    const external = links.filter((l) => l.kind === 'external');
    expect(followable).toHaveLength(5);
    expect(followable.map((l) => l.ref)).toEqual(['#1', '#2', '#3', '#4', '#5']);
    expect(external.map((l) => l.ref)).toEqual(['#6', '#7']);
  });

  it('returns [] for an empty or missing body', () => {
    expect(extractIntentLinks(null, repo, 1)).toEqual([]);
    expect(extractIntentLinks('', repo, 1)).toEqual([]);
  });
});
