/**
 * These tests run against the Tauri mock layer (jsdom).
 * For IPC correctness, also verify with `npm run tauri dev`.
 * See CLAUDE.md: "NEVER test only against mocks".
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { SearchPanel } from "../search/SearchPanel";

// ── Mock layout store with a project root ───────────────────────────────────

vi.mock("@/stores/layout", () => {
  const store = {
    projectRootPath: "/mock-project",
  };
  return {
    useLayoutStore: Object.assign(
      (selector: (s: typeof store) => unknown) => selector(store),
      { getState: () => store },
    ),
  };
});

// ── Mock editor store ───────────────────────────────────────────────────────

vi.mock("@/stores/editor", () => {
  const store = {
    openFile: vi.fn(),
  };
  return {
    useEditorStore: Object.assign(
      (selector: (s: typeof store) => unknown) => selector(store),
      { getState: () => store },
    ),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockInvoke = invoke as Mock;

function mockSearchResults(overrides?: Partial<{
  files: Array<{
    file_path: string;
    matches: Array<{
      file_path: string;
      line_number: number;
      line_text: string;
      column_start: number;
      match_length: number;
    }>;
  }>;
  total_matches: number;
  truncated: boolean;
}>) {
  return {
    files: [
      {
        file_path: "/mock-project/src/App.tsx",
        matches: [
          {
            file_path: "/mock-project/src/App.tsx",
            line_number: 10,
            line_text: "  const greeting = 'hello world';",
            column_start: 21,
            match_length: 5,
          },
        ],
      },
    ],
    total_matches: 1,
    truncated: false,
    ...overrides,
  };
}

// Give virtualizer scroll containers a real height so items render in jsdom
const originalGetBCR = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { width: 300, height: 600, top: 0, left: 0, bottom: 600, right: 300, x: 0, y: 0, toJSON: () => ({}) };
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGetBCR;
});

describe("SearchPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    mockInvoke.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input", () => {
    render(<SearchPanel />);
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });

  it("typing in search input updates query and triggers search after debounce", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const searchResult = mockSearchResults();
    mockInvoke.mockResolvedValue(searchResult);

    render(<SearchPanel />);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "hello");

    // Advance the 300ms debounce
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "search_project",
        expect.objectContaining({
          query: "hello",
          root: "/mock-project",
        }),
      );
    });
  });

  it("displays results when matches exist", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const searchResult = mockSearchResults({ total_matches: 1 });
    mockInvoke.mockResolvedValue(searchResult);

    render(<SearchPanel />);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "hello");

    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText("1 result in 1 file")).toBeInTheDocument();
    });

    // Note: Individual file results are rendered via @tanstack/react-virtual.
    // jsdom lacks real scroll dimensions, so the virtualizer may not render rows.
    // The summary line above confirms the data loaded correctly.
  });

  it("shows 'No results' when search returns empty", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockInvoke.mockResolvedValue({ files: [], total_matches: 0, truncated: false });

    render(<SearchPanel />);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "nonexistent");

    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText("No results")).toBeInTheDocument();
    });
  });

  it("does not search when query is fewer than 2 characters", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SearchPanel />);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "a");

    vi.advanceTimersByTime(300);

    // Should not have called search_project
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "search_project",
      expect.anything(),
    );
  });

  it("can toggle case-sensitive mode", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockInvoke.mockResolvedValue(mockSearchResults());

    render(<SearchPanel />);

    // Click the Match Case button
    const caseSensitiveBtn = screen.getByTitle("Match Case");
    await user.click(caseSensitiveBtn);

    // Type a query and let debounce fire
    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "hello");
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "search_project",
        expect.objectContaining({
          caseSensitive: true,
        }),
      );
    });
  });

  it("can toggle regex mode", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockInvoke.mockResolvedValue(mockSearchResults());

    render(<SearchPanel />);

    // Click the Regex button
    const regexBtn = screen.getByTitle("Use Regular Expression");
    await user.click(regexBtn);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "hel+o");
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "search_project",
        expect.objectContaining({
          isRegex: true,
        }),
      );
    });
  });

  it("shows 'Invalid regex' when regex mode is on and pattern is bad", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SearchPanel />);

    // Enable regex mode
    const regexBtn = screen.getByTitle("Use Regular Expression");
    await user.click(regexBtn);

    // Type an invalid regex - use ** which is invalid but does not contain
    // userEvent special characters like [ or {
    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "**invalid");
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText("Invalid regex")).toBeInTheDocument();
    });

    // Should NOT call search_project with invalid regex
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "search_project",
      expect.anything(),
    );
  });

  it("shows replace input when replace toggle is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SearchPanel />);

    // Click Toggle Search & Replace button
    const replaceToggle = screen.getByTitle("Toggle Search & Replace");
    await user.click(replaceToggle);

    expect(screen.getByPlaceholderText("Replace")).toBeInTheDocument();
  });

  it("replace all button is disabled when query is too short", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SearchPanel />);

    // Enable replace mode
    await user.click(screen.getByTitle("Toggle Search & Replace"));

    // The Replace All button should exist but be disabled
    const replaceAllBtn = screen.getByTitle("Replace All");
    expect(replaceAllBtn).toBeDisabled();
  });

  it("shows results list with aria role", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockInvoke.mockResolvedValue(mockSearchResults());

    render(<SearchPanel />);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "hello");
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByRole("list", { name: "Search results" })).toBeInTheDocument();
    });
  });

  it("shows truncated warning when results are truncated", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockInvoke.mockResolvedValue(
      mockSearchResults({ total_matches: 1000, truncated: true }),
    );

    render(<SearchPanel />);

    const input = screen.getByPlaceholderText("Search");
    await user.type(input, "hello");
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByText(/results truncated/)).toBeInTheDocument();
    });
  });

  it("shows glob filter input when filter button is toggled", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<SearchPanel />);

    const filterBtn = screen.getByTitle("Toggle File Filter");
    await user.click(filterBtn);

    expect(
      screen.getByPlaceholderText("e.g., *.ts, *.{tsx,jsx}"),
    ).toBeInTheDocument();
  });
});
