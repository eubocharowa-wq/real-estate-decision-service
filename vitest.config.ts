import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts?(x)"],
    // Keep CI/local execution deterministic as the suite grows; excessive
    // worker fan-out starves jsdom tests and trips their wall-clock timeout.
    maxWorkers: 4,
  },
});
