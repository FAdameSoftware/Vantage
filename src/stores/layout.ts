import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type ActivityBarItem = "explorer" | "search" | "git" | "agents" | "settings";

/** Snapshot of panel visibility used to restore state after zen mode exits */
export interface ZenModeSnapshot {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
}

export type ViewMode = "claude" | "ide";

export interface LayoutState {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
  activeActivityBarItem: ActivityBarItem;
  primarySidebarSize: number;
  secondarySidebarSize: number;
  panelSize: number;
  /** @deprecated Use panelLayout percentages instead. Kept for workspace migration. */
  primarySidebarPixelWidth: number;
  /** @deprecated Use panelLayout percentages instead. Kept for workspace migration. */
  secondarySidebarPixelWidth: number;
  /** Persisted percentage-based layout for the outer horizontal panel group [primarySidebar, center, rightPanel] */
  horizontalLayout: number[];
  /** Persisted percentage-based layout for the center vertical panel group [editor, bottomPanel] */
  verticalLayout: number[];
  /** The currently open project root path (set when a folder is opened) */
  projectRootPath: string | null;
  /** URL currently shown in the browser preview (null = no preview) */
  previewUrl: string | null;
  /** Whether the preview panel is actively showing a webview */
  previewActive: boolean;
  /** Active panel tab in the bottom panel area */
  activePanelTab: "terminal" | "browser" | "verification";
  /** View mode for the agents panel: kanban board or tree hierarchy */
  agentsViewMode: "kanban" | "tree";
  /** Currently selected agent ID for the detail panel (null = no agent selected) */
  selectedAgentId: string | null;
  /** Whether zen mode (distraction-free editing) is active */
  zenMode: boolean;
  /** Saved panel visibility state before zen mode was activated */
  zenModeSnapshot: ZenModeSnapshot | null;
  /** Active view mode: "claude" for chat-first layout, "ide" for traditional editor layout */
  viewMode: ViewMode;
  /** When true, auto-open file previews when Claude touches a file */
  autoOpenFiles: boolean;
  /** Tab ID currently flashing (brief pulse to indicate activity), auto-clears after 2s */
  flashPanelTab: string | null;
  /** Flash a panel tab briefly to indicate activity (auto-clears after 2 seconds) */
  setFlashPanelTab: (tab: string | null) => void;
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  togglePanel: () => void;
  setActiveActivityBarItem: (item: ActivityBarItem) => void;
  setPrimarySidebarSize: (size: number) => void;
  setSecondarySidebarSize: (size: number) => void;
  setPanelSize: (size: number) => void;
  setPrimarySidebarPixelWidth: (width: number) => void;
  setSecondarySidebarPixelWidth: (width: number) => void;
  setHorizontalLayout: (sizes: number[]) => void;
  setVerticalLayout: (sizes: number[]) => void;
  setProjectRootPath: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setPreviewActive: (active: boolean) => void;
  setActivePanelTab: (tab: "terminal" | "browser" | "verification") => void;
  setAgentsViewMode: (mode: "kanban" | "tree") => void;
  setSelectedAgentId: (id: string | null) => void;
  toggleZenMode: () => void;
  /** Set the view mode directly */
  setViewMode: (mode: ViewMode) => void;
  /** Toggle between claude and ide view modes */
  toggleViewMode: () => void;

  /** Reset layout to defaults, preserving projectRootPath (used on workspace switch) */
  resetToDefaults: () => void;
}

export const useLayoutStore = create<LayoutState>()(
    (set, get) => ({
      primarySidebarVisible: true,
      secondarySidebarVisible: true,
      panelVisible: true,
      activeActivityBarItem: "explorer",
      primarySidebarSize: 20,
      secondarySidebarSize: 25,
      panelSize: 30,
      primarySidebarPixelWidth: 240,
      secondarySidebarPixelWidth: 300,
      horizontalLayout: [15, 60, 25],
      verticalLayout: [70, 30],
      projectRootPath: null,
      previewUrl: null,
      previewActive: false,
      activePanelTab: "terminal",
      agentsViewMode: "kanban",
      selectedAgentId: null,
      zenMode: false,
      zenModeSnapshot: null,
      viewMode: "claude",
      autoOpenFiles: true,
      flashPanelTab: null,
      setFlashPanelTab: (tab) => {
        set({ flashPanelTab: tab });
        if (tab !== null) {
          setTimeout(() => {
            // Only clear if the value hasn't been changed by another call
            if (get().flashPanelTab === tab) {
              set({ flashPanelTab: null });
            }
          }, 2000);
        }
      },
      togglePrimarySidebar: () => set({ primarySidebarVisible: !get().primarySidebarVisible }),
      toggleSecondarySidebar: () => set({ secondarySidebarVisible: !get().secondarySidebarVisible }),
      togglePanel: () => set({ panelVisible: !get().panelVisible }),
      setActiveActivityBarItem: (item) => {
        const current = get();
        if (current.activeActivityBarItem === item && current.primarySidebarVisible) {
          set({ primarySidebarVisible: false });
        } else {
          set({ activeActivityBarItem: item, primarySidebarVisible: true });
        }
      },
      setPrimarySidebarSize: (size) => set({ primarySidebarSize: size }),
      setSecondarySidebarSize: (size) => set({ secondarySidebarSize: size }),
      setPanelSize: (size) => set({ panelSize: size }),
      setPrimarySidebarPixelWidth: (width) => set({ primarySidebarPixelWidth: width }),
      setSecondarySidebarPixelWidth: (width) => set({ secondarySidebarPixelWidth: width }),
      setHorizontalLayout: (sizes) => set({ horizontalLayout: sizes }),
      setVerticalLayout: (sizes) => set({ verticalLayout: sizes }),
      setProjectRootPath: (path) => {
        const prev = get().projectRootPath;
        set({ projectRootPath: path });
        // Stop all active Claude sessions when switching projects
        if (prev && prev !== path) {
          invoke("claude_stop_all_sessions").catch((e: unknown) => {
            console.warn("Failed to stop sessions on project switch:", e);
          });
        }
      },
      setPreviewUrl: (url) => set({ previewUrl: url, ...(url ? { previewActive: true, activePanelTab: "browser" } : {}) }),
      setPreviewActive: (active) => set({ previewActive: active }),
      setActivePanelTab: (tab) => set({ activePanelTab: tab }),
      setAgentsViewMode: (mode) => set({ agentsViewMode: mode }),
      setSelectedAgentId: (id) => set({ selectedAgentId: id }),

      toggleZenMode: () => {
        const current = get();
        if (current.zenMode) {
          // Exit zen mode: restore saved snapshot
          const snap = current.zenModeSnapshot;
          set({
            zenMode: false,
            zenModeSnapshot: null,
            primarySidebarVisible: snap?.primarySidebarVisible ?? true,
            secondarySidebarVisible: snap?.secondarySidebarVisible ?? true,
            panelVisible: snap?.panelVisible ?? true,
          });
        } else {
          // Enter zen mode: snapshot current state and hide everything
          set({
            zenMode: true,
            zenModeSnapshot: {
              primarySidebarVisible: current.primarySidebarVisible,
              secondarySidebarVisible: current.secondarySidebarVisible,
              panelVisible: current.panelVisible,
            },
            primarySidebarVisible: false,
            secondarySidebarVisible: false,
            panelVisible: false,
          });
        }
      },

      setViewMode: (mode) => set({ viewMode: mode }),
      toggleViewMode: () => set({ viewMode: get().viewMode === "claude" ? "ide" : "claude" }),

      resetToDefaults: () => {
        const currentPath = get().projectRootPath;
        set({
          primarySidebarVisible: true,
          secondarySidebarVisible: true,
          panelVisible: true,
          activeActivityBarItem: "explorer",
          primarySidebarSize: 20,
          secondarySidebarSize: 25,
          panelSize: 30,
          primarySidebarPixelWidth: 240,
          secondarySidebarPixelWidth: 300,
          horizontalLayout: [15, 60, 25],
          verticalLayout: [70, 30],
          projectRootPath: currentPath, // preserve
          previewUrl: null,
          previewActive: false,
          activePanelTab: "terminal",
          agentsViewMode: "kanban",
          selectedAgentId: null,
          zenMode: false,
          zenModeSnapshot: null,
          viewMode: "claude",
          autoOpenFiles: true,
          flashPanelTab: null,
        });
      },
    }),
);
