/**
 * These tests run against the Tauri mock layer (jsdom).
 * For IPC correctness, also verify with `npm run tauri dev`.
 * See CLAUDE.md: "NEVER test only against mocks".
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { FileExplorer } from "../files/FileExplorer";
import type { FileNode } from "@/hooks/useFileTree";

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_TREE: FileNode[] = [
  {
    name: "src",
    path: "/test-project/src",
    is_dir: true,
    is_file: false,
    extension: null,
    children: [
      {
        name: "App.tsx",
        path: "/test-project/src/App.tsx",
        is_dir: false,
        is_file: true,
        extension: "tsx",
        children: null,
        is_symlink: false,
        size: 2048,
      },
      {
        name: "main.tsx",
        path: "/test-project/src/main.tsx",
        is_dir: false,
        is_file: true,
        extension: "tsx",
        children: null,
        is_symlink: false,
        size: 512,
      },
    ],
    is_symlink: false,
    size: null,
  },
  {
    name: "package.json",
    path: "/test-project/package.json",
    is_dir: false,
    is_file: true,
    extension: "json",
    children: null,
    is_symlink: false,
    size: 1024,
  },
];

// ── Mock useFileTree hook ───────────────────────────────────────────────────

const mockToggleExpand = vi.fn();
const mockRefresh = vi.fn();
const mockSetRootPath = vi.fn();

let mockFileTreeReturn = {
  tree: MOCK_TREE,
  isLoading: false,
  error: null as string | null,
  expandedPaths: new Set<string>(["/test-project/src"]),
  toggleExpand: mockToggleExpand,
  refresh: mockRefresh,
  rootPath: "/test-project" as string | null,
  setRootPath: mockSetRootPath,
};

vi.mock("@/hooks/useFileTree", () => ({
  useFileTree: () => mockFileTreeReturn,
}));

// ── Mock useGitStatus hook ──────────────────────────────────────────────────

vi.mock("@/hooks/useGitStatus", () => ({
  useGitStatus: () => ({
    fileStatuses: new Map(),
    branch: null,
    allStatuses: [],
    stagedFiles: [],
    unstagedFiles: [],
    isGitRepo: false,
    refresh: vi.fn(),
  }),
}));

// ── Mock editor store ───────────────────────────────────────────────────────
// Use a stable reference created inside the factory to avoid hoisting issues.

const editorMockStore = {
  openFile: vi.fn(),
};

vi.mock("@/stores/editor", () => ({
  useEditorStore: Object.assign(
    (selector: (s: typeof editorMockStore) => unknown) => selector(editorMockStore),
    { getState: () => editorMockStore },
  ),
}));

// ── Mock agents store (for ConflictBanner and investigate) ──────────────────

vi.mock("@/stores/agents", () => {
  const store = {
    agents: new Map(),
    createAgent: vi.fn().mockReturnValue("mock-agent-id"),
  };
  return {
    useAgentsStore: Object.assign(
      (selector: (s: typeof store) => unknown) => selector(store),
      { getState: () => store },
    ),
  };
});

// ── Mock context menu (shadcn radix primitives don't work in jsdom) ─────────

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="context-menu-content">{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <div data-testid="context-menu-item" onClick={onClick}>
      {children}
    </div>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const mockInvoke = invoke as Mock;

describe("FileExplorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({
      path: "/test-project/src/App.tsx",
      content: "export default function App() {}",
      language: "typescriptreact",
    });
    mockFileTreeReturn = {
      tree: MOCK_TREE,
      isLoading: false,
      error: null,
      expandedPaths: new Set(["/test-project/src"]),
      toggleExpand: mockToggleExpand,
      refresh: mockRefresh,
      rootPath: "/test-project",
      setRootPath: mockSetRootPath,
    };
  });

  it("renders file tree with expected nodes", () => {
    render(<FileExplorer />);

    // The tree container should have the right aria role
    expect(screen.getByRole("tree", { name: "File Explorer" })).toBeInTheDocument();

    // Directory and file names should be visible
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("App.tsx")).toBeInTheDocument();
    expect(screen.getByText("main.tsx")).toBeInTheDocument();
    expect(screen.getByText("package.json")).toBeInTheDocument();
  });

  it("shows project name in toolbar header", () => {
    render(<FileExplorer />);

    // The last segment of rootPath is the project name
    expect(screen.getByText("test-project")).toBeInTheDocument();
  });

  it("shows 'No folder open' when rootPath is null", () => {
    mockFileTreeReturn = {
      ...mockFileTreeReturn,
      rootPath: null,
      tree: [],
    };

    render(<FileExplorer />);

    expect(screen.getByText("No folder open")).toBeInTheDocument();
    expect(screen.getByText("Open Folder")).toBeInTheDocument();
  });

  it("calls invoke to read file when a file node is clicked", async () => {
    const user = userEvent.setup();

    render(<FileExplorer />);

    // Click on a file
    await user.click(screen.getByText("App.tsx"));

    expect(mockInvoke).toHaveBeenCalledWith("read_file", {
      path: "/test-project/src/App.tsx",
    });
  });

  it("calls openFile on the editor store after reading file", async () => {
    const user = userEvent.setup();

    render(<FileExplorer />);

    await user.click(screen.getByText("App.tsx"));

    // Wait for the async invoke to complete
    await vi.waitFor(() => {
      expect(editorMockStore.openFile).toHaveBeenCalledWith(
        "/test-project/src/App.tsx",
        "App.tsx",
        "typescriptreact",
        "export default function App() {}",
        true, // preview mode for single-click
      );
    });
  });

  it("calls toggleExpand when a directory is clicked", async () => {
    const user = userEvent.setup();

    render(<FileExplorer />);

    // Click on the directory node
    await user.click(screen.getByText("src"));

    expect(mockToggleExpand).toHaveBeenCalledWith("/test-project/src");
  });

  it("shows context menu items", () => {
    render(<FileExplorer />);

    // Context menu items should be rendered (our mock renders them inline)
    const menuContent = screen.getByTestId("context-menu-content");
    const items = within(menuContent).getAllByTestId("context-menu-item");

    // Should have: New File, New Folder, Rename, Delete, Copy Path, Investigate with Claude
    const itemTexts = items.map((item) => item.textContent);
    expect(itemTexts).toContain("New File");
    expect(itemTexts).toContain("New Folder");
    expect(itemTexts).toContain("Rename");
    expect(itemTexts).toContain("Delete");
    expect(itemTexts).toContain("Copy Path");
    expect(itemTexts).toContain("Investigate with Claude");
  });

  it("shows error message when error is set", () => {
    mockFileTreeReturn = {
      ...mockFileTreeReturn,
      error: "Permission denied",
    };

    render(<FileExplorer />);

    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });

  it("shows loading state when isLoading and tree is empty", () => {
    mockFileTreeReturn = {
      ...mockFileTreeReturn,
      isLoading: true,
      tree: [],
    };

    render(<FileExplorer />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("has a refresh button that calls refresh", async () => {
    const user = userEvent.setup();

    render(<FileExplorer />);

    const refreshBtn = screen.getByLabelText("Refresh file tree");
    await user.click(refreshBtn);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("has a filter input that filters files", async () => {
    const user = userEvent.setup();

    render(<FileExplorer />);

    const filterInput = screen.getByPlaceholderText("Filter files...");
    expect(filterInput).toBeInTheDocument();

    // Type a filter
    await user.type(filterInput, "App");

    // The filter input should have the typed value
    expect(filterInput).toHaveValue("App");
  });

  it("clears filter when X button is clicked", async () => {
    const user = userEvent.setup();

    render(<FileExplorer />);

    const filterInput = screen.getByPlaceholderText("Filter files...");
    await user.type(filterInput, "something");

    // Clear button should appear
    const clearBtn = screen.getByLabelText("Clear filter");
    await user.click(clearBtn);

    expect(filterInput).toHaveValue("");
  });
});
