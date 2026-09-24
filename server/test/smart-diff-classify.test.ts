import { describe, expect, it } from 'vitest';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';

describe('classifyFile', () => {
  it.each([
    // boilerplate
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['client/dist/app.js', 'boilerplate'],
    ['src/__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['api.generated.ts', 'boilerplate'],
    ['vendor/x.min.js', 'boilerplate'],
    // tests
    ['client/src/Foo.test.tsx', 'tests'],
    ['server/test/reviews.it.test.ts', 'tests'],
    ['a.spec.ts', 'tests'],
    ['server/test/helpers/pg.ts', 'tests'],
    ['e2e/README.md', 'tests'],
    // wiring
    ['client/src/index.ts', 'wiring'],
    ['server/package.json', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['.claude/skills/security/SKILL.md', 'wiring'],
    // docs
    ['docs/architecture.md', 'docs'],
    ['README.md', 'docs'],
    ['CHANGELOG', 'docs'],
    ['LICENSE', 'docs'],
    // core
    ['server/src/modules/reviews/service.ts', 'core'],
    ['src/config.ts', 'core'],
    ['server/src/modules/reviews/smart-diff/build.ts', 'core'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});
