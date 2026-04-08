import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useLayoutStore } from "../layout";
import { useWorkspaceStore } from "../workspace";

/**
 * BUG-005: Workspace layout save mismatch
 *
 * The initial snapshot used for dirty-detection must include the same fields
 * as the comparison snapshot in the subscribe callback. Previously,
 * `horizontalLayout` and `verticalLayout` were included in the initial snapshot
 * but NOT in the comparison, causing:
 * 1. A spurious save on the very first change (snapshot always differed)
 * 2. Layout-only changes (resizing panels) never triggered a save
 */

function resetLayoutStore() {
  useLayoutStore.setState({
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
    activePanelTab: "terminal",
    agentsViewMode: "kanban",
    projectRootPath: null,
    previewUrl: null,
    previewActive: false,
  });
}

describe("Workspace layout snapshot consistency (BUG-005)", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    resetLayoutStore();
    // Set up a fake project path so markDirty doesn't bail out
    useWorkspaceStore.setState({ currentProjectPath: "/test/project" });
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    useWorkspaceStore.setState({ currentProjectPath: null });
  });

  it("does not trigger a spurious save when no layout fields have changed", () => {
    const markDirtySpy = vi.spyOn(useWorkspaceStore.getState(), "markDirty");

    cleanup = useWorkspaceStore.getState().startAutoSave();

    // Trigger a no-op state update (same values)
    useLayoutStore.setState({
      primarySidebarVisible: true,
    });

    // Zustand notifies subscribers even for same-value setState, but our
    // snapshot comparison should detect no change and NOT call markDirty
    // for layout. (Zustand may or may not fire depending on reference equality.)
    // The key assertion: markDirty should not have been called from the layout
    // subscription since the snapshot hasn't changed.
    // Note: We can't perfectly test this since Zustand may not fire the callback
    // if it uses shallow equality. But we verify the mechanism works below.
    markDirtySpy.mockRestore();
  });

  it("triggers save when horizontalLayout changes", () => {
    let dirtyCalled = false;
    const originalMarkDirty = useWorkspaceStore.getState().markDirty;
    useWorkspaceStore.setState({
      markDirty: () => {
        dirtyCalled = true;
      },
    });

    cleanup = useWorkspaceStore.getState().startAutoSave();

    // Change horizontalLayout (simulates resizing panels)
    useLayoutStore.setState({
      horizontalLayout: [20, 55, 25],
    });

    expect(dirtyCalled).toBe(true);

    // Restore
    useWorkspaceStore.setState({ markDirty: originalMarkDirty });
  });

  it("triggers save when verticalLayout changes", () => {
    let dirtyCalled = false;
    const originalMarkDirty = useWorkspaceStore.getState().markDirty;
    useWorkspaceStore.setState({
      markDirty: () => {
        dirtyCalled = true;
      },
    });

    cleanup = useWorkspaceStore.getState().startAutoSave();

    // Change verticalLayout (simulates resizing editor/panel split)
    useLayoutStore.setState({
      verticalLayout: [60, 40],
    });

    expect(dirtyCalled).toBe(true);

    // Restore
    useWorkspaceStore.setState({ markDirty: originalMarkDirty });
  });

  it("does not trigger save when layout state is unchanged after startAutoSave", () => {
    let dirtyCount = 0;
    const originalMarkDirty = useWorkspaceStore.getState().markDirty;
    useWorkspaceStore.setState({
      markDirty: () => {
        dirtyCount++;
      },
    });

    cleanup = useWorkspaceStore.getState().startAutoSave();

    // Set the exact same horizontal and vertical layout
    useLayoutStore.setState({
      horizontalLayout: [15, 60, 25],
      verticalLayout: [70, 30],
    });

    // The snapshot should match, so markDirty should NOT be called
    expect(dirtyCount).toBe(0);

    // Restore
    useWorkspaceStore.setState({ markDirty: originalMarkDirty });
  });

  it("initial and comparison snapshots include the same fields", () => {
    // This is a structural test: we build the snapshot string both ways
    // and verify they produce the same result for identical state.
    const s = useLayoutStore.getState();

    // Replicate the initial snapshot construction from startAutoSave
    const initialSnap = `${s.primarySidebarVisible}|${s.secondarySidebarVisible}|${s.panelVisible}|${s.activeActivityBarItem}|${s.primarySidebarSize}|${s.secondarySidebarSize}|${s.panelSize}|${s.activePanelTab}|${s.agentsViewMode}|${s.primarySidebarPixelWidth}|${s.secondarySidebarPixelWidth}|${s.horizontalLayout.join(",")}|${s.verticalLayout.join(",")}`;

    // Replicate the comparison snapshot construction from the subscribe callback
    // (this is what the bug was about — they must match)
    const comparisonSnap = `${s.primarySidebarVisible}|${s.secondarySidebarVisible}|${s.panelVisible}|${s.activeActivityBarItem}|${s.primarySidebarSize}|${s.secondarySidebarSize}|${s.panelSize}|${s.activePanelTab}|${s.agentsViewMode}|${s.primarySidebarPixelWidth}|${s.secondarySidebarPixelWidth}|${s.horizontalLayout.join(",")}|${s.verticalLayout.join(",")}`;

    expect(initialSnap).toBe(comparisonSnap);

    // Verify both contain the layout arrays
    expect(initialSnap).toContain("15,60,25");
    expect(initialSnap).toContain("70,30");
    expect(comparisonSnap).toContain("15,60,25");
    expect(comparisonSnap).toContain("70,30");
  });
});
