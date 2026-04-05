import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type ActivityBarItem = "explorer" | "search" | "git" | "agents" | "settings";

export interface LayoutState {
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;
  activeActivityBarItem: ActivityBarItem;
  primarySidebarSize: number;
  secondarySidebarSize: number;
  panelSize: number;
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
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  togglePanel: () => void;
  setActiveActivityBarItem: (item: ActivityBarItem) => void;
  setPrimarySidebarSize: (size: number) => void;
  setSecondarySidebarSize: (size: number) => void;
  setPanelSize: (size: number) => void;
  setProjectRootPath: (path: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setPreviewActive: (active: boolean) => void;
  setActivePanelTab: (tab: "terminal" | "browser" | "verification") => void;
  setAgentsViewMode: (mode: "kanban" | "tree") => void;
  setSelectedAgentId: (id: string | null) => void;

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
      projectRootPath: null,
      previewUrl: null,
      previewActive: false,
      activePanelTab: "terminal",
      agentsViewMode: "kanban",
      selectedAgentId: null,
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
          projectRootPath: currentPath, // preserve
          previewUrl: null,
          previewActive: false,
          activePanelTab: "terminal",
          agentsViewMode: "kanban",
          selectedAgentId: null,
        });
      },
    }),
);
