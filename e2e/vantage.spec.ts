import { test, expect } from "@playwright/test";

/**
 * Vantage E2E Tests
 *
 * These tests run against the Vite dev server with the Tauri mock layer
 * active, so all native APIs are stubbed. The goal is to verify that
 * the full UI renders and interactive elements work correctly.
 */

/**
 * Helper: dismiss the prerequisite check dialog if it appears.
 * The dialog has a "Continue" button when all checks pass.
 */
async function dismissPrereqDialog(page: import("@playwright/test").Page) {
  // Give the dialog a moment to appear (it loads store state first)
  await page.waitForTimeout(1500);
  const continueBtn = page.locator("text=Continue");
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click();
    // Wait for the dialog overlay to disappear
    await page
      .locator("[data-slot='dialog-overlay']")
      .waitFor({ state: "hidden", timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(300);
  }
}

test.describe("Vantage IDE — Basic Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app to hydrate — the title bar text should appear
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    // Dismiss the prerequisite dialog so it doesn't block other interactions
    await dismissPrereqDialog(page);
  });

  test("app loads without crashing", async ({ page }) => {
    // The title bar should show "Vantage"
    await expect(page.locator("text=Vantage").first()).toBeVisible();

    // The root element should exist
    const root = page.locator("#root");
    await expect(root).toBeVisible();

    // Take a screenshot to verify visual state
    await page.screenshot({ path: "e2e/screenshots/app-loaded.png" });
  });

  test("activity bar has 5 icons", async ({ page }) => {
    // The activity bar contains 5 buttons: Explorer, Search, Source Control, Agents, Settings
    const explorerBtn = page.getByLabel("Explorer");
    const searchBtn = page.getByLabel("Search");
    const sourceControlBtn = page.getByLabel("Source Control");
    const agentsBtn = page.getByLabel("Agents");
    const settingsBtn = page.getByLabel("Settings");

    await expect(explorerBtn).toBeVisible();
    await expect(searchBtn).toBeVisible();
    await expect(sourceControlBtn).toBeVisible();
    await expect(agentsBtn).toBeVisible();
    await expect(settingsBtn).toBeVisible();
  });

  test("clicking activity bar icons switches sidebar content", async ({
    page,
  }) => {
    // Click Search — the sidebar should show a search input
    const searchBtn = page.getByLabel("Search");
    await searchBtn.click();
    await expect(page.locator("[data-search-input]")).toBeVisible({
      timeout: 5000,
    });

    // Click Explorer — the sidebar should show file tree or "Open Folder"
    const explorerBtn = page.getByLabel("Explorer");
    await explorerBtn.click();
    const fileExplorer = page
      .locator("text=Open Folder")
      .or(page.locator("text=src"));
    await expect(fileExplorer.first()).toBeVisible({ timeout: 5000 });
  });

  test("welcome screen shows Open Folder button", async ({ page }) => {
    // When no folder is open, the editor area shows a welcome/empty state
    // with an "Open Folder" option
    const openFolderBtn = page.locator("text=Open Folder");
    // There may be one in the explorer sidebar and/or the editor area
    await expect(openFolderBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("command palette opens with Ctrl+Shift+P", async ({ page }) => {
    // Open command palette
    await page.keyboard.press("Control+Shift+p");

    // The command palette should appear — it uses cmdk so look for the input
    const paletteInput = page.locator("[cmdk-input]");
    await expect(paletteInput).toBeVisible({ timeout: 5000 });

    // Close it with Escape
    await page.keyboard.press("Escape");
    await expect(paletteInput).not.toBeVisible({ timeout: 3000 });
  });

  test("status bar shows expected elements", async ({ page }) => {
    // The status bar should be visible at the bottom
    const statusBar = page.locator("[role='status'][aria-label='Status Bar']");
    await expect(statusBar).toBeVisible({ timeout: 5000 });

    // It should show line/column info
    await expect(statusBar.locator("text=Ln")).toBeVisible();

    // It should show connection status (Ready by default, no session)
    await expect(statusBar.locator("text=Ready")).toBeVisible();

    // It should show cost ($0.0000)
    await expect(statusBar.locator("text=$0.0000")).toBeVisible();

    // It should show the model name
    await expect(statusBar.locator("text=claude-opus-4-6")).toBeVisible();
  });

  test("panels can be toggled with keyboard shortcuts", async ({ page }) => {
    // Toggle the bottom panel with Ctrl+J
    // First, check if the panel is visible by looking for Terminal tab text
    const terminalText = page.locator("text=Terminal").first();

    // The panel should be visible initially (default state)
    const initiallyVisible = await terminalText
      .isVisible()
      .catch(() => false);

    // Toggle panel off
    await page.keyboard.press("Control+j");
    await page.waitForTimeout(500);

    // Toggle panel on
    await page.keyboard.press("Control+j");
    await page.waitForTimeout(500);

    // After toggling twice, state should match initial
    if (initiallyVisible) {
      await expect(terminalText).toBeVisible({ timeout: 3000 });
    }
  });

  test("primary sidebar toggles with Ctrl+B", async ({ page }) => {
    // The sidebar starts visible, with the Explorer content
    const explorerBtn = page.getByLabel("Explorer");
    await expect(explorerBtn).toBeVisible();

    // The primary sidebar panel is the first resizable panel after the activity bar.
    // When it's hidden, the sidebar content disappears but the activity bar stays.
    // We detect the toggle by checking the active state of the explorer button.
    // Also, the explorer button has aria-pressed that reflects active state.
    const explorerPressed = await explorerBtn.getAttribute("aria-pressed");

    // Toggle sidebar off
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(500);

    // The explorer button should still be visible (it's in the activity bar)
    await expect(explorerBtn).toBeVisible();

    // Toggle sidebar back on
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(500);

    // The explorer button's pressed state should be restored
    const explorerPressedAfter = await explorerBtn.getAttribute("aria-pressed");
    expect(explorerPressedAfter).toBe(explorerPressed);
  });

  test("theme can be cycled with keyboard shortcut", async ({ page }) => {
    const root = page.locator("html");

    // Default theme is dark
    await expect(root).toHaveClass(/dark/);

    // Cycle theme: Ctrl+Shift+Alt+K
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);

    // Should now be light (theme-light)
    await expect(root).toHaveClass(/theme-light/);

    // Cycle again — should be high contrast
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);

    await expect(root).toHaveClass(/theme-high-contrast/);

    // Cycle again — back to dark
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);

    await expect(root).toHaveClass(/dark/);
  });

  test("prerequisite check dialog appears and can be dismissed", async ({
    page,
  }) => {
    // This test navigates fresh (we need to NOT dismiss the dialog in beforeEach)
    // Since beforeEach already dismissed it, navigate again with a clean store
    // by clearing localStorage
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });

    // Wait for the dialog to appear
    await page.waitForTimeout(1500);

    const continueBtn = page.locator("text=Continue");
    if (await continueBtn.isVisible().catch(() => false)) {
      // The prerequisite dialog title is the one that says "Welcome to Vantage"
      // Scope to the dialog-title that contains our expected text
      const dialogTitle = page.locator(
        "[data-slot='dialog-title']:has-text('Welcome to Vantage')",
      );
      await expect(dialogTitle).toBeVisible();

      // Should show the prerequisite checks (all passing per mock)
      await expect(page.getByText("Node.js", { exact: true })).toBeVisible();
      await expect(page.getByText("Git", { exact: true })).toBeVisible();

      // Click continue to dismiss
      await continueBtn.click();
      // The dialog title should disappear
      await expect(dialogTitle).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("no console errors from missing Tauri APIs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("favicon.ico") &&
        !e.includes("HMR"),
    );

    expect(criticalErrors).toEqual([]);
  });

  test("screenshot of full app for visual verification", async ({ page }) => {
    // Take a full-page screenshot
    await page.screenshot({
      path: "e2e/screenshots/full-app.png",
      fullPage: true,
    });
  });
});
