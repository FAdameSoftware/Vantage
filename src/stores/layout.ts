import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type ActivityBarItem = "explorer" | "search" | "git" | "agents" | "settings";

/** Snapshot of panel visibility used to restore state after zen mode exits */
export interface ZenModeSnapshot {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
}

export interface LayoutState {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
  activeActivityBarItem: ActivityBarItem;
  primarySidebarSize: number;
  secondarySidebarSize: number;
  panelSize: number;
  /** Pixel width of the primary sidebar drag handle (persisted) */
  primarySidebarPixelWidth: number;
  /** Pixel width of the secondary sidebar drag handle (persisted) */
  secondarySidebarPixelWidth: number;
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
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  togglePanel: () => void;
  setActiveActivityBarItem: (item: ActivityBarItem) => void;
  setPrimarySidebarSize: (size: number) => void;
  setSecondarySidebarSize: (size: number) => void;
  setPanelSize: (size: number) => void;
  setPrimarySidebarPixelWidth: (width: number) => void;
  setSecondarySidebarPixelWidth: (width: number) => void;
  setProjectRootPath: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setPreviewActive: (active: boolean) => void;
  setActivePanelTab: (tab: "terminal" | "browser" | "verification") => void;
  setAgentsViewMode: (mode: "kanban" | "tree") => void;
  setSelectedAgentId: (id: string | null) => void;
  toggleZenMode: () => void;

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
      projectRootPath: null,
      previewUrl: null,
      previewActive: false,
      activePanelTab: "terminal",
      agentsViewMode: "kanban",
      selectedAgentId: null,
      zenMode: false,
      zenModeSnapshot: null,
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
          projectRootPath: currentPath, // preserve
          previewUrl: null,
          previewActive: false,
          activePanelTab: "terminal",
          agentsViewMode: "kanban",
          selectedAgentId: null,
          zenMode: false,
          zenModeSnapshot: null,
        });
      },
    }),
);
