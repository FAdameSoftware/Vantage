/**
 * Test setup for component tests.
 * Mocks Tauri APIs and other environment-specific dependencies.
 */
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// ── Polyfill ResizeObserver (required by cmdk, not available in jsdom) ───────

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// ── Polyfill HTMLElement.scrollIntoView (not available in jsdom) ─────────────

if (typeof HTMLElement.prototype.scrollIntoView === "undefined") {
  HTMLElement.prototype.scrollIntoView = function () {};
}

// ── Mock Tauri core API ──────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: vi.fn(),
}));

// ── Mock lucide-react icons (simple span stubs) ─────────────────────────────

// lucide-react works fine in jsdom, no need to mock.

// ── Mock monaco-editor ───────────────────────────────────────────────────────

vi.mock("monaco-editor", () => ({
  editor: {
    getEditors: vi.fn().mockReturnValue([]),
  },
}));
