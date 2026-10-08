import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: 420_000,
    hookTimeout: 420_000,
    // Sequential files: parallel sessions got rate-limited, degrading runs to 0–1 turns (flaky traces).
    fileParallelism: false,
    reporters: ["default", new TrendReporter()],
  },
});
