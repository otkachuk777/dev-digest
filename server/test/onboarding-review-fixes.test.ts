import { describe, expect, it } from 'vitest';
import { classifyLlmError, groundOutput, type TourLlmOutput } from '../src/modules/onboarding/helpers.js';
import type { TourSections } from '../src/modules/onboarding/model.js';
import { mkFacts } from './helpers/onboarding-facts.js';

const facts = mkFacts({
  scripts: {
    manifests: [{ dir: null, scripts: ['dev'] }],
    makeTargets: [],
    composeServices: [],
    hasCompose: false,
    envExampleNames: [],
    hasEnvExample: false,
    readmeCommands: [],
  },
});
const skeleton: TourSections = {
  architecture: { body: 's', diagram: null },
  critical_paths: [],
  how_to_run: [],
  reading_path: [],
  first_tasks: [],
};

describe('onboarding review fixes', () => {
  it('C2: a provider 400 mentioning JSON is provider_error, adapter schema failure is invalid_output', () => {
    expect(classifyLlmError(new Error('model does not support response_format json_schema'))).toBe('provider_error');
    expect(classifyLlmError(new Error('OpenRouter structured output failed schema validation for X'))).toBe('invalid_output');
    expect(classifyLlmError(new Error('OpenAI structured output failed schema validation'))).toBe('invalid_output');
    expect(classifyLlmError(new Error('OpenRouter returned no choices for X'))).toBe('invalid_output');
  });

  it('C4: duplicate (command, cwd) pairs are dropped and counted', () => {
    const out: TourLlmOutput = {
      architecture: { body: 'b', diagram: null },
      critical_path_reasons: [],
      reading_path_reasons: [],
      how_to_run: [
        { command: 'pnpm run dev', cwd: null, comment: null },
        { command: 'pnpm  run dev', cwd: '.', comment: 'dup' },
      ],
      first_tasks: [],
    };
    const { sections, dropped } = groundOutput(out, skeleton, facts, () => true);
    expect(sections.how_to_run).toHaveLength(1);
    expect(dropped).toBe(1);
  });
});
