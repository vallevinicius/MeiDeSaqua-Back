import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // process.chdir (usado no setup para isolar os uploads) exige processos, não threads.
    pool: "forks",
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts", "src/interfaces/**"],
      reporter: ["text", "html"],
    },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
