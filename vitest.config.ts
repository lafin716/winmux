import { defineConfig } from "vitest/config";

// Headless unit tests only: pure modules under src/, no DOM or Vue component
// mounting. A dedicated config keeps the Tauri-tailored vite.config.ts out of
// the test run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
