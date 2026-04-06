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

export type SplitDirection = "none" | "horizontal" | "vertical";

export interface EditorState {
  /** All open tabs in order */
  tabs: EditorTab[];
  /** ID of the currently active tab (null if no tabs open) */
  activeTabId: string | null;
  /** Current cursor position in the active editor */
  cursorPosition: CursorPosition;
  /** Current vim mode label (only meaningful when vim mode is enabled) */
  vimModeLabel: string;
  /** Number of lines covered by the current selection (0 = no multi-line selection) */
  selectionLineCount: number;

  // ── Split Editor ───────────────────────────────────────────────────
  /** Direction of the editor split ("none" = no split) */
  splitDirection: SplitDirection;
  /** Tab ID shown in the secondary (split) pane */
  secondaryActiveTabId: string | null;

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
  /** Update the selected line count (0 means no notable selection) */
  setSelectionLineCount: (count: number) => void;
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

  // ── Split Editor Actions ───────────────────────────────────────────
  /** Open a tab in a split pane */
  splitEditor: (tabId: string, direction: SplitDirection) => void;
  /** Close the split pane */
  closeSplit: () => void;
  /** Set the active tab in the secondary pane */
  setSecondaryActiveTab: (tabId: string) => void;

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

  /** Close all tabs to the right of the given tab ID */
  closeTabsToTheRight: (id: string) => void;

  /** Reorder tabs by moving the tab at fromIndex to toIndex */
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  /** Reset the editor store to its default state (used on workspace switch) */
  resetToDefaults: () => void;
}

// ── Fine-grained selectors ────────────────────────────────────────────
// These prevent unnecessary re-renders in components that only need
// specific slices of the editor state (e.g., tab names for the tab bar,
// dirty state for the status bar) rather than the full tabs array which
// changes on every keystroke due to content updates.

/** Select only the currently active tab object (or null). */
export const selectActiveTab = (s: EditorState): EditorTab | null =>
  s.tabs.find((t) => t.id === s.activeTabId) ?? null;

/**
 * Select tab metadata for the tab bar (excludes content to avoid re-renders on typing).
 *
 * WARNING: This selector creates a new array on every call via .map().
 * Do NOT use directly with useEditorStore(selectTabList) — it will cause
 * infinite re-renders. Wrap with useShallow or derive via useMemo after
 * selecting s.tabs.
 */
export const selectTabList = (s: EditorState) =>
  s.tabs.map((t) => ({
    id: t.id,
    path: t.path,
    name: t.name,
    isDirty: t.isDirty,
    isPreview: t.isPreview,
    language: t.language,
  }));

/** Whether any tab has unsaved changes (stable boolean — no array allocation). */
export const selectHasDirtyTabs = (s: EditorState): boolean =>
  s.tabs.some((t) => t.isDirty);

/**
 * Select only the IDs of tabs with unsaved changes.
 *
 * WARNING: This selector creates a new array on every call via .filter().map().
 * Do NOT use directly with useEditorStore(selectDirtyTabIds) — it will cause
 * infinite re-renders. Wrap with useShallow or derive via useMemo after
 * selecting s.tabs.
 */
export const selectDirtyTabIds = (s: EditorState): string[] =>
  s.tabs.filter((t) => t.isDirty).map((t) => t.id);

/** Select the content of the active tab (for the editor itself). */
export const selectActiveTabContent = (s: EditorState): string | null => {
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  return tab?.content ?? null;
};

/** Select the active tab ID only. */
export const selectActiveTabId = (s: EditorState): string | null => s.activeTabId;

/** Select cursor position only. */
export const selectCursorPosition = (s: EditorState) => s.cursorPosition;

/** Select the selected line count only. */
export const selectSelectionLineCount = (s: EditorState) => s.selectionLineCount;

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
  selectionLineCount: 0,
  splitDirection: "none",
  secondaryActiveTabId: null,
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
    const { tabs, activeTabId, secondaryActiveTabId, splitDirection, markdownPreviewTabs, popoutTabs, pendingDiffs } = get();
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

    // If the closed tab was the secondary split tab, close the split
    let newSplitDirection = splitDirection;
    let newSecondaryActiveTabId = secondaryActiveTabId;
    if (secondaryActiveTabId === id) {
      newSplitDirection = "none";
      newSecondaryActiveTabId = null;
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
      splitDirection: newSplitDirection,
      secondaryActiveTabId: newSecondaryActiveTabId,
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

  setSelectionLineCount: (count) => {
    set({ selectionLineCount: count });
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
      splitDirection: "none",
      secondaryActiveTabId: null,
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

  splitEditor: (tabId, direction) => {
    if (direction === "none") {
      set({ splitDirection: "none", secondaryActiveTabId: null });
      return;
    }
    // Only split if the tab exists
    const { tabs } = get();
    if (tabs.find((t) => t.id === tabId)) {
      set({ splitDirection: direction, secondaryActiveTabId: tabId });
    }
  },

  closeSplit: () => {
    set({ splitDirection: "none", secondaryActiveTabId: null });
  },

  setSecondaryActiveTab: (tabId) => {
    set({ secondaryActiveTabId: tabId });
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

  closeTabsToTheRight: (id) => {
    const { tabs, markdownPreviewTabs, popoutTabs, pendingDiffs } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const keepTabs = tabs.slice(0, idx + 1);
    const removedIds = new Set(tabs.slice(idx + 1).map((t) => t.id));

    const nextPreview = new Set<string>();
    markdownPreviewTabs.forEach((tid) => {
      if (!removedIds.has(tid)) nextPreview.add(tid);
    });
    const nextPopout = new Set<string>();
    popoutTabs.forEach((tid) => {
      if (!removedIds.has(tid)) nextPopout.add(tid);
    });
    const nextDiffs = new Map<string, PendingDiff>();
    pendingDiffs.forEach((diff, tid) => {
      if (!removedIds.has(tid)) nextDiffs.set(tid, diff);
    });

    set({
      tabs: keepTabs,
      activeTabId: id,
      markdownPreviewTabs: nextPreview,
      popoutTabs: nextPopout,
      pendingDiffs: nextDiffs,
    });
  },

  reorderTabs: (fromIndex, toIndex) => {
    const { tabs } = get();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= tabs.length ||
      toIndex >= tabs.length
    ) {
      return;
    }
    const next = [...tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ tabs: next });
  },

  resetToDefaults: () => {
    set({
      tabs: [],
      activeTabId: null,
      cursorPosition: { line: 1, column: 1 },
      vimModeLabel: "NORMAL",
      selectionLineCount: 0,
      splitDirection: "none",
      secondaryActiveTabId: null,
      markdownPreviewTabs: new Set<string>(),
      popoutTabs: new Set<string>(),
      pendingDiffs: new Map<string, PendingDiff>(),
    });
  },
}));
