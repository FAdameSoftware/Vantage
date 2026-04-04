import { describe, it, expect, beforeEach } from "vitest";
import { useLayoutStore } from "../layout";

beforeEach(() => {
  useLayoutStore.setState({
    primarySidebarVisible: true,
    secondarySidebarVisible: true,
    panelVisible: true,
    activeActivityBarItem: "explorer",
    primarySidebarSize: 20,
    secondarySidebarSize: 25,
    panelSize: 30,
  });
});

describe("Layout Store", () => {
  it("has correct defaults", () => {
    const state = useLayoutStore.getState();
    expect(state.primarySidebarVisible).toBe(true);
    expect(state.secondarySidebarVisible).toBe(true);
    expect(state.panelVisible).toBe(true);
    expect(state.activeActivityBarItem).toBe("explorer");
    expect(state.primarySidebarSize).toBe(20);
    expect(state.secondarySidebarSize).toBe(25);
    expect(state.panelSize).toBe(30);
  });

  it("toggles primary sidebar", () => {
    const { togglePrimarySidebar } = useLayoutStore.getState();
    togglePrimarySidebar();
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(false);
    togglePrimarySidebar();
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(true);
  });

  it("toggles secondary sidebar", () => {
    const { toggleSecondarySidebar } = useLayoutStore.getState();
    toggleSecondarySidebar();
    expect(useLayoutStore.getState().secondarySidebarVisible).toBe(false);
    toggleSecondarySidebar();
    expect(useLayoutStore.getState().secondarySidebarVisible).toBe(true);
  });

  it("toggles panel", () => {
    const { togglePanel } = useLayoutStore.getState();
    togglePanel();
    expect(useLayoutStore.getState().panelVisible).toBe(false);
    togglePanel();
    expect(useLayoutStore.getState().panelVisible).toBe(true);
  });

  it("setting a different active item opens the sidebar", () => {
    // Start with sidebar open and explorer active; switch to search
    useLayoutStore.getState().setActiveActivityBarItem("search");
    const state = useLayoutStore.getState();
    expect(state.activeActivityBarItem).toBe("search");
    expect(state.primarySidebarVisible).toBe(true);
  });

  it("clicking the already-active item collapses the sidebar", () => {
    // Sidebar is visible and active item is "explorer"
    useLayoutStore.getState().setActiveActivityBarItem("explorer");
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(false);
  });

  it("sets panel and sidebar sizes", () => {
    const { setPrimarySidebarSize, setSecondarySidebarSize, setPanelSize } =
      useLayoutStore.getState();
    setPrimarySidebarSize(30);
    setSecondarySidebarSize(35);
    setPanelSize(40);
    const state = useLayoutStore.getState();
    expect(state.primarySidebarSize).toBe(30);
    expect(state.secondarySidebarSize).toBe(35);
    expect(state.panelSize).toBe(40);
  });
});
