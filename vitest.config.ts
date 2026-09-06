import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts?(x)"],
    // Keep CI/local execution deterministic as the suite grows; excessive
    // worker fan-out starves jsdom tests and trips their wall-clock timeout.
    maxWorkers: 4,
    // A few integration tests (pilot benchmark, golden buyer journey, api
    // integration) legitimately run for seconds and exceeded the default 5s
    // budget under parallel load; performance stays an explicit assertion
    // inside the benchmark itself.
    testTimeout: 30_000,
  },
});
