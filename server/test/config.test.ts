import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

describe('loadConfig contextDocs (CONTEXT_DOCS_GLOB)', () => {
  it('AC-1: defaults to **/{specs,docs,insights}/**/*.md with all three roots', () => {
    expect(loadConfig({}).contextDocs).toEqual({
      glob: '**/{specs,docs,insights}/**/*.md',
      roots: ['specs', 'docs', 'insights'],
    });
  });

  it('accepts a subset in braces and a single root without braces', () => {
    expect(loadConfig({ CONTEXT_DOCS_GLOB: '**/{specs,docs}/**/*.md' }).contextDocs.roots).toEqual([
      'specs',
      'docs',
    ]);
    const one = loadConfig({ CONTEXT_DOCS_GLOB: '**/insights/**/*.md' }).contextDocs;
    expect(one).toEqual({ glob: '**/insights/**/*.md', roots: ['insights'] });
  });

  it('throws on an invalid shape', () => {
    expect(() => loadConfig({ CONTEXT_DOCS_GLOB: 'docs/*.md' })).toThrow(/CONTEXT_DOCS_GLOB/);
    expect(() => loadConfig({ CONTEXT_DOCS_GLOB: '**/{specs,}/**/*.md' })).toThrow(/CONTEXT_DOCS_GLOB/);
  });

  it('throws on an unknown root', () => {
    expect(() => loadConfig({ CONTEXT_DOCS_GLOB: '**/{specs,notes}/**/*.md' })).toThrow(
      /CONTEXT_DOCS_GLOB/,
    );
  });
});

describe('loadConfig apiHost', () => {
  it('listens on loopback by default (no-auth API must not reach the LAN)', () => {
    expect(loadConfig({}).apiHost).toBe('localhost');
  });

  it('honours an explicit API_HOST', () => {
    expect(loadConfig({ API_HOST: '0.0.0.0' }).apiHost).toBe('0.0.0.0');
  });
});
