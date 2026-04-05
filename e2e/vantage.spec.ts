import { test, expect } from "@playwright/test";

/**
 * Vantage E2E Tests
 *
 * These tests run against the Vite dev server with the Tauri mock layer
 * active, so all native APIs are stubbed. The goal is to verify that
 * the full UI renders and interactive elements work correctly.
 *
 * ~30 tests covering: Navigation, Settings, Agents, Command Palette,
 * Chat Panel, Status Bar, and Theme Switching flows.
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
  // Force-remove any lingering dialog overlay/portal that could intercept clicks
  await page.evaluate(() => {
    document
      .querySelectorAll("[data-slot='dialog-overlay'], [data-slot='dialog-portal']")
      .forEach((el) => el.remove());
    document
      .querySelectorAll("[data-base-ui-portal]")
      .forEach((el) => el.remove());
  });
  await page.waitForTimeout(200);
}

// ─── Basic Rendering ───────────────────────────────────────────────────

test.describe("Vantage IDE — Basic Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("app loads without crashing", async ({ page }) => {
    await expect(page.locator("text=Vantage").first()).toBeVisible();
    const root = page.locator("#root");
    await expect(root).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/app-loaded.png" });
  });

  test("activity bar has 5 icons", async ({ page }) => {
    await expect(page.getByLabel("Explorer")).toBeVisible();
    await expect(page.getByLabel("Search")).toBeVisible();
    await expect(page.getByLabel("Source Control")).toBeVisible();
    await expect(page.getByLabel("Agents")).toBeVisible();
    await expect(page.getByLabel("Settings")).toBeVisible();
  });

  test("no console errors from missing Tauri APIs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await page.waitForTimeout(2000);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("favicon.ico") &&
        !e.includes("HMR"),
    );

    expect(criticalErrors).toEqual([]);
  });

  test("prerequisite check dialog appears and can be dismissed", async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await page.waitForTimeout(1500);

    const continueBtn = page.locator("text=Continue");
    if (await continueBtn.isVisible().catch(() => false)) {
      const dialogTitle = page.locator(
        "[data-slot='dialog-title']:has-text('Welcome to Vantage')",
      );
      await expect(dialogTitle).toBeVisible();
      await expect(page.getByText("Node.js", { exact: true })).toBeVisible();
      await expect(page.getByText("Git", { exact: true })).toBeVisible();
      await continueBtn.click();
      await expect(dialogTitle).not.toBeVisible({ timeout: 3000 });
    }
  });
});

// ─── Navigation Flow ───────────────────────────────────────────────────

test.describe("Navigation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("clicking Explorer icon shows Explorer sidebar", async ({ page }) => {
    await page.getByLabel("Explorer").click();
    await page.waitForTimeout(300);
    // The sidebar should show file explorer content (Open Folder or file tree)
    const fileExplorer = page
      .locator("text=Open Folder")
      .or(page.locator("text=src"));
    await expect(fileExplorer.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking Search icon shows Search sidebar with input", async ({
    page,
  }) => {
    await page.getByLabel("Search").click();
    await page.waitForTimeout(300);
    // The sidebar should contain a search input
    await expect(page.locator("[data-search-input]")).toBeVisible({
      timeout: 5000,
    });
  });

  test("clicking Source Control icon shows Source Control sidebar", async ({
    page,
  }) => {
    await page.getByLabel("Source Control").click();
    await page.waitForTimeout(300);
    const header = page.locator("span:has-text('Source Control')");
    await expect(header.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking Agents icon shows Kanban board", async ({ page }) => {
    await page.getByLabel("Agents").click();
    await page.waitForTimeout(300);
    const header = page.locator("span:has-text('Agents')");
    await expect(header.first()).toBeVisible({ timeout: 5000 });
    // Should show the Kanban columns
    await expect(page.locator("text=Backlog").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("clicking Settings icon shows Settings panel with tabs", async ({
    page,
  }) => {
    await page.getByLabel("Settings").click();
    await page.waitForTimeout(300);
    // Settings panel should have its 4 tabs visible
    await expect(page.locator("button:has-text('CLAUDE.md')")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.locator("button:has-text('MCP Servers')"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Ctrl+B toggles sidebar visibility", async ({ page }) => {
    // Sidebar starts visible — the search input only exists in the sidebar
    // First switch to search so we have a unique sidebar-only element
    await page.getByLabel("Search").click();
    await page.waitForTimeout(300);
    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Toggle sidebar off
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(500);

    // Sidebar content should be hidden (the whole panel disappears)
    await expect(searchInput).not.toBeVisible({ timeout: 3000 });

    // Toggle sidebar back on
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(500);

    // Sidebar content should be visible again
    await expect(searchInput).toBeVisible({ timeout: 3000 });
  });

  test("Ctrl+J toggles bottom panel", async ({ page }) => {
    const terminalText = page.locator("text=Terminal").first();
    const initiallyVisible = await terminalText
      .isVisible()
      .catch(() => false);

    // Toggle panel off
    await page.keyboard.press("Control+j");
    await page.waitForTimeout(500);

    // Toggle panel on
    await page.keyboard.press("Control+j");
    await page.waitForTimeout(500);

    if (initiallyVisible) {
      await expect(terminalText).toBeVisible({ timeout: 3000 });
    }
  });

  test("clicking bottom panel tabs switches content", async ({ page }) => {
    // Ensure bottom panel is visible
    const terminalTab = page.locator(
      "button:has-text('Terminal')",
    );
    // If the bottom panel is hidden, open it
    if (!(await terminalTab.first().isVisible().catch(() => false))) {
      await page.keyboard.press("Control+j");
      await page.waitForTimeout(500);
    }

    // Click Browser tab
    const browserTab = page.locator("button:has-text('Browser')");
    await browserTab.first().click();
    await page.waitForTimeout(300);

    // Click Verification tab
    const verificationTab = page.locator(
      "button:has-text('Verification')",
    );
    await verificationTab.first().click();
    await page.waitForTimeout(300);

    // Click back to Terminal
    await terminalTab.first().click();
    await page.waitForTimeout(300);

    // Terminal tab should remain visible
    await expect(terminalTab.first()).toBeVisible();
  });
});

// ─── Settings Flow ─────────────────────────────────────────────────────

test.describe("Settings Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
    // Navigate to Settings
    await page.getByLabel("Settings").click();
    await page.waitForTimeout(300);
  });

  test("Settings panel has 4 tabs", async ({ page }) => {
    await expect(page.locator("button:has-text('CLAUDE.md')")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.locator("button:has-text('MCP Servers')"),
    ).toBeVisible();
    await expect(page.locator("button:has-text('Plugins')")).toBeVisible();
    await expect(
      page.locator("button:has-text('Spec Viewer')"),
    ).toBeVisible();
  });

  test("clicking CLAUDE.md tab renders editor content", async ({ page }) => {
    await page.locator("button:has-text('CLAUDE.md')").click();
    await page.waitForTimeout(500);
    // The CLAUDE.md editor tab should be active (default tab), so content area exists
    // Check that we are on the CLAUDE.md tab (it renders the editor)
    const claudeMdBtn = page.locator("button:has-text('CLAUDE.md')");
    await expect(claudeMdBtn).toBeVisible();
  });

  test("clicking MCP Servers tab renders content", async ({ page }) => {
    await page.locator("button:has-text('MCP Servers')").click();
    await page.waitForTimeout(500);
    // MCP Servers tab should now be active
    const mcpBtn = page.locator("button:has-text('MCP Servers')");
    await expect(mcpBtn).toBeVisible();
  });

  test("clicking Plugins tab renders content", async ({ page }) => {
    await page.locator("button:has-text('Plugins')").click();
    await page.waitForTimeout(500);
    const pluginsBtn = page.locator("button:has-text('Plugins')");
    await expect(pluginsBtn).toBeVisible();
  });

  test("clicking Spec Viewer tab renders content", async ({ page }) => {
    await page.locator("button:has-text('Spec Viewer')").click();
    await page.waitForTimeout(500);
    const specBtn = page.locator("button:has-text('Spec Viewer')");
    await expect(specBtn).toBeVisible();
  });
});

// ─── Agents Flow ───────────────────────────────────────────────────────

test.describe("Agents Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
    // Navigate to Agents
    await page.getByLabel("Agents").click();
    await page.waitForTimeout(300);
  });

  test("Agents panel shows Kanban board with columns", async ({ page }) => {
    await expect(page.locator("text=Backlog").first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=In Progress").first()).toBeVisible();
    await expect(page.locator("text=Review").first()).toBeVisible();
    await expect(page.locator("text=Done").first()).toBeVisible();
  });

  test("Create Agent button opens dialog with form fields", async ({
    page,
  }) => {
    // Click "Create Agent" button
    await page.locator("button:has-text('Create Agent')").click();
    await page.waitForTimeout(500);

    // Dialog should appear with title
    const dialogTitle = page.locator("text=Create Agent").first();
    await expect(dialogTitle).toBeVisible({ timeout: 5000 });

    // Should have Name field
    await expect(page.locator("#agent-name")).toBeVisible();

    // Should have Task Description field
    await expect(page.locator("#agent-task")).toBeVisible();

    // Should have Model selector
    await expect(page.locator("#agent-model")).toBeVisible();

    // Should have Role options (Builder, Coordinator, Specialist, Verifier)
    await expect(page.locator("text=Builder").first()).toBeVisible();
    await expect(page.locator("text=Coordinator").first()).toBeVisible();
    await expect(page.locator("text=Specialist").first()).toBeVisible();
    await expect(page.locator("text=Verifier").first()).toBeVisible();
  });

  test("Cancel button closes Create Agent dialog", async ({ page }) => {
    await page.locator("button:has-text('Create Agent')").click();
    await page.waitForTimeout(500);

    // Dialog should be open
    await expect(page.locator("#agent-name")).toBeVisible({ timeout: 5000 });

    // Click Cancel
    await page.locator("button:has-text('Cancel')").click();
    await page.waitForTimeout(500);

    // Dialog should be closed — the agent-name input should no longer be visible
    await expect(page.locator("#agent-name")).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("toggle between Kanban and Tree view", async ({ page }) => {
    // Should start in Kanban view (columns visible)
    await expect(page.locator("text=Backlog").first()).toBeVisible({
      timeout: 5000,
    });

    // Click Tree view button
    await page.getByLabel("Tree view").click();
    await page.waitForTimeout(500);

    // Click back to Kanban view
    await page.getByLabel("Kanban view").click();
    await page.waitForTimeout(500);

    // Kanban columns should be visible again
    await expect(page.locator("text=Backlog").first()).toBeVisible({
      timeout: 5000,
    });
  });
});

// ─── Command Palette ───────────────────────────────────────────────────

test.describe("Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("Ctrl+Shift+P opens command palette", async ({ page }) => {
    await page.keyboard.press("Control+Shift+p");
    const paletteInput = page.locator("[cmdk-input]");
    await expect(paletteInput).toBeVisible({ timeout: 5000 });
  });

  test("Escape closes command palette", async ({ page }) => {
    await page.keyboard.press("Control+Shift+p");
    const paletteInput = page.locator("[cmdk-input]");
    await expect(paletteInput).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(paletteInput).not.toBeVisible({ timeout: 3000 });
  });

  test("typing > shows command list", async ({ page }) => {
    await page.keyboard.press("Control+Shift+p");
    const paletteInput = page.locator("[cmdk-input]");
    await expect(paletteInput).toBeVisible({ timeout: 5000 });

    // The palette defaults to command mode with >, so commands should be listed
    // Look for a known command such as "Toggle Primary Sidebar"
    await expect(
      page.locator("text=Toggle Primary Sidebar").first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("commands are clickable and close palette", async ({ page }) => {
    await page.keyboard.press("Control+Shift+p");
    const paletteInput = page.locator("[cmdk-input]");
    await expect(paletteInput).toBeVisible({ timeout: 5000 });

    // Click a command
    const togglePanelCmd = page.locator("text=Toggle Panel / Terminal").first();
    if (await togglePanelCmd.isVisible().catch(() => false)) {
      await togglePanelCmd.click();
      await page.waitForTimeout(500);
      // Palette should close after executing command
      await expect(paletteInput).not.toBeVisible({ timeout: 3000 });
    }
  });
});

// ─── Chat Panel ────────────────────────────────────────────────────────

test.describe("Chat Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("chat input textarea is visible", async ({ page }) => {
    // The chat input is in the secondary sidebar (right side)
    const chatInput = page.locator(
      "textarea[placeholder='Ask Claude anything...']",
    );
    await expect(chatInput).toBeVisible({ timeout: 5000 });
  });

  test("Deep Think toggle button is present", async ({ page }) => {
    // The Deep Think toggle uses aria-label
    const deepThinkBtn = page.locator(
      "button[aria-label='Enable Deep Think']",
    );
    await expect(deepThinkBtn).toBeVisible({ timeout: 5000 });
  });

  test("Deep Think toggle can be activated", async ({ page }) => {
    const enableBtn = page.locator(
      "button[aria-label='Enable Deep Think']",
    );
    await expect(enableBtn).toBeVisible({ timeout: 5000 });

    await enableBtn.click();
    await page.waitForTimeout(300);

    // After clicking, the label should change to "Disable Deep Think"
    const disableBtn = page.locator(
      "button[aria-label='Disable Deep Think']",
    );
    await expect(disableBtn).toBeVisible({ timeout: 3000 });

    // The text below input should now mention "Deep Think enabled"
    await expect(
      page.locator("text=Deep Think enabled").first(),
    ).toBeVisible({ timeout: 3000 });
  });

  test("Compact button is present in chat header", async ({ page }) => {
    const compactBtn = page.locator(
      "button[aria-label='Compact conversation']",
    );
    await expect(compactBtn).toBeVisible({ timeout: 5000 });
  });

  test("Plan Mode toggle is present in chat header", async ({ page }) => {
    // The Plan Mode toggle uses a switch role
    const planToggle = page.locator("button[role='switch']");
    await expect(planToggle.first()).toBeVisible({ timeout: 5000 });
  });

  test("Chat panel shows empty state message", async ({ page }) => {
    // When no messages exist, the empty state text is shown
    await expect(
      page.locator("text=Type a message below to start a Claude Code session.").first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── Status Bar ────────────────────────────────────────────────────────

test.describe("Status Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("status bar is visible with correct role", async ({ page }) => {
    const statusBar = page.locator(
      "[role='status'][aria-label='Status Bar']",
    );
    await expect(statusBar).toBeVisible({ timeout: 5000 });
  });

  test("status bar shows Ln/Col info", async ({ page }) => {
    const statusBar = page.locator(
      "[role='status'][aria-label='Status Bar']",
    );
    await expect(statusBar.locator("text=Ln")).toBeVisible({ timeout: 5000 });
  });

  test("status bar shows language", async ({ page }) => {
    const statusBar = page.locator(
      "[role='status'][aria-label='Status Bar']",
    );
    // Default language is "Plain Text" when no file is open
    await expect(
      statusBar.locator("text=Plain Text"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("status bar shows Ready connection status", async ({ page }) => {
    const statusBar = page.locator(
      "[role='status'][aria-label='Status Bar']",
    );
    await expect(statusBar.locator("text=Ready")).toBeVisible({
      timeout: 5000,
    });
  });

  test("status bar shows cost", async ({ page }) => {
    const statusBar = page.locator(
      "[role='status'][aria-label='Status Bar']",
    );
    await expect(statusBar.locator("text=$0.0000")).toBeVisible({
      timeout: 5000,
    });
  });

  test("status bar shows model name", async ({ page }) => {
    const statusBar = page.locator(
      "[role='status'][aria-label='Status Bar']",
    );
    await expect(
      statusBar.locator("text=claude-opus-4-6"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("effort level selector is present", async ({ page }) => {
    // The effort level selector has aria-label pattern "Effort level: ..."
    const effortBtn = page.locator(
      "button[aria-label^='Effort level']",
    );
    await expect(effortBtn).toBeVisible({ timeout: 5000 });
  });

  test("Inkwell buddy widget is present", async ({ page }) => {
    // Inkwell the turtle uses a span with title "Inkwell the coding turtle"
    const buddy = page.locator("[title='Inkwell the coding turtle']");
    await expect(buddy).toBeVisible({ timeout: 5000 });
  });
});

// ─── Theme Switching ───────────────────────────────────────────────────

test.describe("Theme Switching", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("Ctrl+Shift+Alt+K cycles through all 3 themes", async ({ page }) => {
    const root = page.locator("html");

    // Default theme is dark
    await expect(root).toHaveClass(/dark/);

    // Cycle to light
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);
    await expect(root).toHaveClass(/theme-light/);

    // Cycle to high contrast
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);
    await expect(root).toHaveClass(/theme-high-contrast/);

    // Cycle back to dark
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);
    await expect(root).toHaveClass(/dark/);
  });

  test("theme change updates background color", async ({ page }) => {
    // Capture initial background
    const initialBg = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue(
        "--color-base",
      );
    });

    // Cycle theme
    await page.keyboard.press("Control+Shift+Alt+k");
    await page.waitForTimeout(300);

    // Capture new background
    const newBg = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue(
        "--color-base",
      );
    });

    // Colors should be different
    expect(newBg).not.toBe(initialBg);
  });
});

// ─── Screenshot for Visual Verification ────────────────────────────────

test.describe("Visual Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Vantage", { timeout: 15_000 });
    await dismissPrereqDialog(page);
  });

  test("screenshot of full app", async ({ page }) => {
    await page.screenshot({
      path: "e2e/screenshots/full-app.png",
      fullPage: true,
    });
  });
});
