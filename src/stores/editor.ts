import { create } from "zustand";

export interface PendingDiff {
  /** Tab ID this diff belongs to */
  tabId: string;
  /** The original content before Claude's edit */
  originalContent: string;
  /** The modified content from Claude's edit */
  modifiedContent: string;
  /** Human-readable description of the change */
  description: string;
}

export interface EditorTab {
  /** Unique ID for this tab (normalized file path) */
  id: string;
  /** Full file path (forward slashes) */
  path: string;
  /** Display name (filename) */
  name: string;
  /** Monaco language ID */
  language: string;
  /** Current file content in the editor */
  content: string;
  /** Content as last saved to disk */
  savedContent: string;
  /** Whether the editor content differs from the saved content */
  isDirty: boolean;
  /** Whether this tab is a preview (italic title, replaced on next single-click) */
  isPreview: boolean;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface EditorState {
  /** All open tabs in order */
  tabs: EditorTab[];
  /** ID of the currently active tab (null if no tabs open) */
  activeTabId: string | null;
  /** Current cursor position in the active editor */
  cursorPosition: CursorPosition;
  /** Current vim mode label (only meaningful when vim mode is enabled) */
  vimModeLabel: string;

  // ── Actions ─────────────────────────────────────────────────────

  /** Open a file in a new tab or switch to it if already open */
  openFile: (
    path: string,
    name: string,
    language: string,
    content: string,
    preview?: boolean
  ) => void;
  /** Close a tab by ID */
  closeTab: (id: string) => void;
  /** Set the active tab */
  setActiveTab: (id: string) => void;
  /** Update the content of a tab (marks it dirty if different from saved) */
  updateContent: (id: string, content: string) => void;
  /** Mark a tab as saved (resets dirty state, updates savedContent) */
  markSaved: (id: string, content: string) => void;
  /** Pin a preview tab (make it permanent) */
  pinTab: (id: string) => void;
  /** Update cursor position for the status bar */
  setCursorPosition: (position: CursorPosition) => void;
  /** Update the vim mode label (NORMAL / INSERT / VISUAL / etc.) */
  setVimModeLabel: (label: string) => void;
  /** Reload a tab's content from disk (external change) */
  reloadTab: (id: string, content: string) => void;
  /** Get the currently active tab, or null */
  getActiveTab: () => EditorTab | null;
  /** Close all tabs */
  closeAllTabs: () => void;
  /** Close all tabs except the given one */
  closeOtherTabs: (id: string) => void;
  /** Set of tab IDs that have markdown preview active */
  markdownPreviewTabs: Set<string>;
  /** Toggle markdown preview for a tab */
  toggleMarkdownPreview: (tabId: string) => void;
  /** Check if a tab has markdown preview active */
  isMarkdownPreviewActive: (tabId: string) => boolean;

  // ── Popout Windows ─────────────────────────────────────────────────

  /** Set of tab IDs that are currently popped out to separate windows */
  popoutTabs: Set<string>;
  /** Pop out a tab to a separate window */
  popoutTab: (tabId: string) => void;
  /** Return a popped-out tab to the main window */
  returnPopoutTab: (tabId: string) => void;
  /** Check if a tab is popped out */
  isPopout: (tabId: string) => boolean;

  // ── Diff Viewer ────────────────────────────────────────────────────
  // Triggered by Claude's Edit/Write tool calls (wired in useClaude hook).

  /** Pending diffs waiting for user accept/reject, keyed by tabId */
  pendingDiffs: Map<string, PendingDiff>;
  /** Set a pending diff for a file (called when Claude edits a file) */
  setPendingDiff: (
    tabId: string,
    original: string,
    modified: string,
    description: string
  ) => void;
  /** Accept the diff: update tab content to modified version */
  acceptDiff: (tabId: string) => void;
  /** Reject the diff: revert tab content to original version */
  rejectDiff: (tabId: string) => void;
  /** Check if a tab has a pending diff */
  hasPendingDiff: (tabId: string) => boolean;
}

/** Normalize a file path to use as a tab ID (forward slashes, lowercase drive letter) */
function normalizeTabId(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  // Lowercase the drive letter on Windows paths like C:/...
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorPosition: { line: 1, column: 1 },
  vimModeLabel: "NORMAL",
  markdownPreviewTabs: new Set<string>(),
  popoutTabs: new Set<string>(),
  pendingDiffs: new Map<string, PendingDiff>(),

  openFile: (path, name, language, content, preview = false) => {
    const id = normalizeTabId(path);
    const { tabs } = get();

    // If file is already open, just switch to it
    const existingTab = tabs.find((t) => t.id === id);
    if (existingTab) {
      // If the existing tab is a preview and this is a non-preview open, pin it
      if (existingTab.isPreview && !preview) {
        set({
          tabs: tabs.map((t) => (t.id === id ? { ...t, isPreview: false } : t)),
          activeTabId: id,
        });
      } else {
        set({ activeTabId: id });
      }
      return;
    }

    // If opening a preview, replace any existing preview tab
    const newTabs = preview ? tabs.filter((t) => !t.isPreview) : [...tabs];

    const newTab: EditorTab = {
      id,
      path: path.replace(/\\/g, "/"),
      name,
      language,
      content,
      savedContent: content,
      isDirty: false,
      isPreview: preview,
    };

    set({
      tabs: [...newTabs, newTab],
      activeTabId: id,
    });
  },

  closeTab: (id) => {
    const { tabs, activeTabId, markdownPreviewTabs, popoutTabs, pendingDiffs } = get();
    const tabIndex = tabs.findIndex((t) => t.id === id);
    if (tabIndex === -1) return;

    const newTabs = tabs.filter((t) => t.id !== id);

    let newActiveId: string | null = null;
    if (activeTabId === id && newTabs.length > 0) {
      // Activate the tab to the left, or the first tab if we closed the leftmost
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      newActiveId = newTabs[newIndex].id;
    } else if (activeTabId !== id) {
      newActiveId = activeTabId;
    }

    // Clean up associated Set/Map entries to prevent unbounded growth.
    // Without this, markdownPreviewTabs, popoutTabs, and pendingDiffs accumulate
    // stale IDs across many tab open/close cycles.
    const nextPreview = new Set(markdownPreviewTabs);
    nextPreview.delete(id);
    const nextPopout = new Set(popoutTabs);
    nextPopout.delete(id);
    const nextDiffs = new Map(pendingDiffs);
    nextDiffs.delete(id);

    set({
      tabs: newTabs,
      activeTabId: newActiveId,
      markdownPreviewTabs: nextPreview,
      popoutTabs: nextPopout,
      pendingDiffs: nextDiffs,
    });
  },

  setActiveTab: (id) => {
    set({ activeTabId: id });
  },

  updateContent: (id, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? { ...t, content, isDirty: content !== t.savedContent }
          : t
      ),
    });
  },

  markSaved: (id, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? { ...t, savedContent: content, content, isDirty: false }
          : t
      ),
    });
  },

  pinTab: (id) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, isPreview: false } : t
      ),
    });
  },

  setCursorPosition: (position) => {
    set({ cursorPosition: position });
  },

  setVimModeLabel: (label) => {
    set({ vimModeLabel: label });
  },

  reloadTab: (id, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? { ...t, content, savedContent: content, isDirty: false }
          : t
      ),
    });
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) ?? null;
  },

  closeAllTabs: () => {
    // Reset all tab-associated collections to prevent stale ID accumulation.
    set({
      tabs: [],
      activeTabId: null,
      markdownPreviewTabs: new Set<string>(),
      popoutTabs: new Set<string>(),
      pendingDiffs: new Map<string, PendingDiff>(),
    });
  },

  closeOtherTabs: (id) => {
    const { tabs, markdownPreviewTabs, popoutTabs, pendingDiffs } = get();
    // Keep only the entries for the surviving tab to prevent stale ID accumulation.
    const nextPreview = new Set<string>();
    if (markdownPreviewTabs.has(id)) nextPreview.add(id);
    const nextPopout = new Set<string>();
    if (popoutTabs.has(id)) nextPopout.add(id);
    const nextDiffs = new Map<string, PendingDiff>();
    const existingDiff = pendingDiffs.get(id);
    if (existingDiff) nextDiffs.set(id, existingDiff);

    set({
      tabs: tabs.filter((t) => t.id === id),
      activeTabId: id,
      markdownPreviewTabs: nextPreview,
      popoutTabs: nextPopout,
      pendingDiffs: nextDiffs,
    });
  },

  popoutTab: (tabId) => {
    set((state) => {
      const next = new Set(state.popoutTabs);
      next.add(tabId);
      return { popoutTabs: next };
    });
  },

  returnPopoutTab: (tabId) => {
    set((state) => {
      const next = new Set(state.popoutTabs);
      next.delete(tabId);
      return { popoutTabs: next };
    });
  },

  isPopout: (tabId) => {
    return get().popoutTabs.has(tabId);
  },

  toggleMarkdownPreview: (tabId) => {
    set((state) => {
      const next = new Set(state.markdownPreviewTabs);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return { markdownPreviewTabs: next };
    });
  },

  isMarkdownPreviewActive: (tabId) => {
    return get().markdownPreviewTabs.has(tabId);
  },

  setPendingDiff: (tabId, original, modified, description) => {
    set((state) => {
      const next = new Map(state.pendingDiffs);
      next.set(tabId, {
        tabId,
        originalContent: original,
        modifiedContent: modified,
        description,
      });
      return { pendingDiffs: next };
    });
  },

  acceptDiff: (tabId) => {
    const diff = get().pendingDiffs.get(tabId);
    if (!diff) return;
    set((state) => {
      const next = new Map(state.pendingDiffs);
      next.delete(tabId);
      return {
        pendingDiffs: next,
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                content: diff.modifiedContent,
                isDirty: diff.modifiedContent !== t.savedContent,
              }
            : t
        ),
      };
    });
  },

  rejectDiff: (tabId) => {
    const diff = get().pendingDiffs.get(tabId);
    if (!diff) return;
    set((state) => {
      const next = new Map(state.pendingDiffs);
      next.delete(tabId);
      return {
        pendingDiffs: next,
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                content: diff.originalContent,
                isDirty: diff.originalContent !== t.savedContent,
              }
            : t
        ),
      };
    });
  },

  hasPendingDiff: (tabId) => {
    return get().pendingDiffs.has(tabId);
  },
}));
