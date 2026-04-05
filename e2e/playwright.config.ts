import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Playwright config for Vantage E2E tests.
 *
 * Runs against the Vite dev server on localhost:1420.
 * The Tauri mock layer (src/lib/tauriMock.ts) intercepts all
 * native API calls so the full UI renders in a regular browser.
 */

const BASE_URL = "http://localhost:1420";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Start the Vite dev server before running tests */
  webServer: {
    command: "npx vite --port 1420",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    cwd: path.resolve(__dirname, ".."),
  },
});
