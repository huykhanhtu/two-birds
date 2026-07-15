import { defineConfig, devices } from "@playwright/test";

// Canonical e2e config for two-birds. Lives in the project so @playwright/test
// and the vite dev server resolve from this package's node_modules. The
// workspace runner entry (tests/_runner/playwright.two-birds.config.ts) points
// here. Paths are relative to this file's directory.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../tests/_runner/reports/two-birds-core-gameplay/e2e-artifacts",
  use: { baseURL: "http://localhost:5173", hasTouch: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], hasTouch: true } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI, // CI must never test a stale dev server
  },
});
