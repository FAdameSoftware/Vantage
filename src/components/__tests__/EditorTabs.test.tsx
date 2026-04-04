import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEditorStore } from "@/stores/editor";
import { EditorTabs } from "../editor/EditorTabs";

// Mock useFloatingWindow hook
vi.mock("@/hooks/useFloatingWindow", () => ({
  useFloatingWindow: () => ({
    popOut: vi.fn(),
    focusPopout: vi.fn(),
  }),
}));

function setupTabs(
  tabs: Array<{
    path: string;
    name: string;
    language?: string;
    content?: string;
    isDirty?: boolean;
    isPreview?: boolean;
  }>,
  activeIndex = 0,
) {
  const store = useEditorStore.getState();
  // Reset
  store.closeAllTabs();

  for (const tab of tabs) {
    store.openFile(
      tab.path,
      tab.name,
      tab.language ?? "typescript",
      tab.content ?? "",
      tab.isPreview ?? false,
    );
  }

  // Set dirty state if needed
  const state = useEditorStore.getState();
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].isDirty) {
      store.updateContent(state.tabs[i].id, "dirty content");
    }
  }

  // Set active tab
  if (state.tabs[activeIndex]) {
    store.setActiveTab(state.tabs[activeIndex].id);
  }
}

describe("EditorTabs", () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      cursorPosition: { line: 1, column: 1 },
      markdownPreviewTabs: new Set(),
      popoutTabs: new Set(),
      pendingDiffs: new Map(),
    });
  });

  it("renders nothing when no tabs are open", () => {
    const { container } = render(<EditorTabs />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a tab for each open file", () => {
    setupTabs([
      { path: "C:/project/a.ts", name: "a.ts" },
      { path: "C:/project/b.ts", name: "b.ts" },
      { path: "C:/project/c.ts", name: "c.ts" },
    ]);

    render(<EditorTabs />);

    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
    expect(screen.getByText("c.ts")).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected", () => {
    setupTabs(
      [
        { path: "C:/project/a.ts", name: "a.ts" },
        { path: "C:/project/b.ts", name: "b.ts" },
      ],
      1,
    );

    render(<EditorTabs />);

    const allTabs = screen.getAllByRole("tab");
    expect(allTabs[0]).toHaveAttribute("aria-selected", "false");
    expect(allTabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("switches active tab on click", async () => {
    const user = userEvent.setup();
    setupTabs(
      [
        { path: "C:/project/a.ts", name: "a.ts" },
        { path: "C:/project/b.ts", name: "b.ts" },
      ],
      0,
    );

    render(<EditorTabs />);

    // Click on second tab
    await user.click(screen.getByText("b.ts"));

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe("c:/project/b.ts");
  });

  it("shows close button for non-dirty tabs", () => {
    setupTabs([{ path: "C:/project/a.ts", name: "a.ts" }]);

    render(<EditorTabs />);

    expect(screen.getByLabelText("Close a.ts")).toBeInTheDocument();
  });

  it("removes tab when close button is clicked", async () => {
    const user = userEvent.setup();
    setupTabs([
      { path: "C:/project/a.ts", name: "a.ts" },
      { path: "C:/project/b.ts", name: "b.ts" },
    ]);

    render(<EditorTabs />);

    await user.click(screen.getByLabelText("Close a.ts"));

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].name).toBe("b.ts");
  });

  it("shows dirty indicator (dot) for modified files instead of close button", () => {
    setupTabs([{ path: "C:/project/a.ts", name: "a.ts", isDirty: true }]);

    render(<EditorTabs />);

    // Dirty indicator has title "Unsaved changes"
    expect(screen.getByTitle("Unsaved changes")).toBeInTheDocument();
    // Close button should NOT be visible for dirty tabs
    expect(screen.queryByLabelText("Close a.ts")).not.toBeInTheDocument();
  });

  it("renders preview tabs in italic style", () => {
    setupTabs([{ path: "C:/project/preview.ts", name: "preview.ts", isPreview: true }]);

    render(<EditorTabs />);

    const tab = screen.getByRole("tab");
    expect(tab).toHaveStyle({ fontStyle: "italic" });
  });

  it("renders non-preview tabs in normal style", () => {
    setupTabs([{ path: "C:/project/normal.ts", name: "normal.ts", isPreview: false }]);

    render(<EditorTabs />);

    const tab = screen.getByRole("tab");
    expect(tab).toHaveStyle({ fontStyle: "normal" });
  });

  it("shows markdown preview toggle for .md files", () => {
    setupTabs([{ path: "C:/project/readme.md", name: "readme.md", language: "markdown" }]);

    render(<EditorTabs />);

    expect(screen.getByLabelText("Show preview")).toBeInTheDocument();
  });

  it("does not show markdown preview toggle for non-md files", () => {
    setupTabs([{ path: "C:/project/a.ts", name: "a.ts", language: "typescript" }]);

    render(<EditorTabs />);

    expect(screen.queryByLabelText("Show preview")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hide preview")).not.toBeInTheDocument();
  });
});
