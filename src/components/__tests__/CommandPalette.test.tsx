import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { CommandPalette } from "../shared/CommandPalette";

// Mock stores used by CommandPalette
vi.mock("@/stores/layout", () => {
  const store = {
    togglePrimarySidebar: vi.fn(),
    toggleSecondarySidebar: vi.fn(),
    togglePanel: vi.fn(),
    setActiveActivityBarItem: vi.fn(),
    projectRootPath: null,
    setActivePanelTab: vi.fn(),
    panelVisible: false,
  };
  return {
    useLayoutStore: Object.assign(
      (selector: (s: typeof store) => unknown) => selector(store),
      { getState: () => store },
    ),
  };
});

vi.mock("@/stores/editor", () => {
  const store = {
    openFile: vi.fn(),
    activeTabId: null,
    closeTab: vi.fn(),
    tabs: [],
  };
  return {
    useEditorStore: Object.assign(
      (selector: (s: typeof store) => unknown) => selector(store),
      { getState: () => store },
    ),
  };
});

vi.mock("@/stores/settings", () => {
  const store = {
    theme: "vantage-dark" as const,
    setTheme: vi.fn(),
  };
  return {
    useSettingsStore: Object.assign(
      (selector: (s: typeof store) => unknown) => selector(store),
      { getState: () => store },
    ),
  };
});

// Mock Tauri invoke for CommandPalette file fetching
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommandPaletteStore.setState({
      isOpen: false,
      mode: "commands",
      searchText: "",
    });
  });

  it("renders nothing when closed", () => {
    render(<CommandPalette />);
    // The dialog should not render visible content when closed
    expect(screen.queryByPlaceholderText("Type a command...")).not.toBeInTheDocument();
  });

  it("renders command input when open in commands mode", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "commands",
      searchText: ">",
    });

    render(<CommandPalette />);

    // The command input should be present
    expect(screen.getByPlaceholderText("Type a command...")).toBeInTheDocument();
  });

  it("shows commands when in command mode", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "commands",
      searchText: ">",
    });

    render(<CommandPalette />);

    // Should show built-in commands
    expect(screen.getByText("Toggle Primary Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Toggle Panel / Terminal")).toBeInTheDocument();
  });

  it("filters commands by search text in command mode", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "commands",
      searchText: ">terminal",
    });

    render(<CommandPalette />);

    // "Toggle Panel / Terminal" and "New Terminal" should match
    expect(screen.getByText("Toggle Panel / Terminal")).toBeInTheDocument();
    expect(screen.getByText("New Terminal")).toBeInTheDocument();
    // Unrelated commands should be filtered out
    expect(screen.queryByText("Focus File Explorer")).not.toBeInTheDocument();
  });

  it("shows goto line view when in goto mode", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "goto",
      searchText: ":42",
    });

    render(<CommandPalette />);

    expect(screen.getByText("Go to Line 42")).toBeInTheDocument();
  });

  it("shows file search placeholder when in files mode", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "files",
      searchText: "",
    });

    render(<CommandPalette />);

    expect(screen.getByPlaceholderText("Search files by name...")).toBeInTheDocument();
  });

  it("switches to commands mode when > prefix is typed", () => {
    useCommandPaletteStore.getState().setSearchText(">test");
    const state = useCommandPaletteStore.getState();
    expect(state.mode).toBe("commands");
    expect(state.searchText).toBe(">test");
  });

  it("switches to goto mode when : prefix is typed", () => {
    useCommandPaletteStore.getState().setSearchText(":100");
    const state = useCommandPaletteStore.getState();
    expect(state.mode).toBe("goto");
    expect(state.searchText).toBe(":100");
  });

  it("switches to files mode when no prefix", () => {
    useCommandPaletteStore.getState().setSearchText("main.ts");
    const state = useCommandPaletteStore.getState();
    expect(state.mode).toBe("files");
  });

  it("shows command shortcuts", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "commands",
      searchText: ">",
    });

    render(<CommandPalette />);

    // Ctrl+B shortcut for toggle primary sidebar
    expect(screen.getByText("Ctrl+B")).toBeInTheDocument();
  });

  it("shows theme commands in Preferences group", () => {
    useCommandPaletteStore.setState({
      isOpen: true,
      mode: "commands",
      searchText: ">theme",
    });

    render(<CommandPalette />);

    expect(screen.getByText("Color Theme: Dark (Catppuccin Mocha)")).toBeInTheDocument();
    expect(screen.getByText("Color Theme: Light (Catppuccin Latte)")).toBeInTheDocument();
  });
});
