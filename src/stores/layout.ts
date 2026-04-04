import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  togglePanel: () => void;
  setActiveActivityBarItem: (item: ActivityBarItem) => void;
  setPrimarySidebarSize: (size: number) => void;
  setSecondarySidebarSize: (size: number) => void;
  setPanelSize: (size: number) => void;
  setProjectRootPath: (path: string | null) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      primarySidebarVisible: true,
      secondarySidebarVisible: true,
      panelVisible: true,
      activeActivityBarItem: "explorer",
      primarySidebarSize: 20,
      secondarySidebarSize: 25,
      panelSize: 30,
      projectRootPath: null,
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
      setProjectRootPath: (path) => set({ projectRootPath: path }),
    }),
    {
      name: "vantage-layout",
      partialize: (state) => ({
        primarySidebarVisible: state.primarySidebarVisible,
        secondarySidebarVisible: state.secondarySidebarVisible,
        panelVisible: state.panelVisible,
        activeActivityBarItem: state.activeActivityBarItem,
        primarySidebarSize: state.primarySidebarSize,
        secondarySidebarSize: state.secondarySidebarSize,
        panelSize: state.panelSize,
        projectRootPath: state.projectRootPath,
      }),
    }
  )
);
