import { useEffect, useCallback } from "react";
import {
  Panel,
  Group,
  Separator,
  usePanelRef,
  type Layout,
} from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout";
import { ActivityBar } from "./ActivityBar";
import { PrimarySidebar } from "./PrimarySidebar";
import { EditorArea } from "./EditorArea";
import { SecondarySidebar } from "./SecondarySidebar";
import { PanelArea } from "./PanelArea";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { ZenModeOverlay } from "./ZenModeOverlay";
import { ClaudeViewLayout } from "./ClaudeViewLayout";
import { useQuickQuestionStore } from "@/stores/quickQuestion";

function HorizontalSeparator() {
  return (
    <Separator
      className="group relative w-[1px] transition-colors duration-150"
      style={{ backgroundColor: "var(--color-surface-0)" }}
    >
      <div
        className="absolute z-10 top-0 bottom-0 -left-[1px] -right-[1px] w-[3px] cursor-col-resize
          group-hover:bg-[var(--color-blue)] group-active:bg-[var(--color-blue)]
          group-data-[resize-handle-active]:bg-[var(--color-blue)]
          transition-colors duration-150"
      />
    </Separator>
  );
}

function VerticalSeparator() {
  return (
    <Separator
      className="group relative h-[1px] transition-colors duration-150"
      style={{ backgroundColor: "var(--color-surface-0)" }}
    >
      <div
        className="absolute z-10 left-0 right-0 -top-[1px] -bottom-[1px] h-[3px] cursor-row-resize
          group-hover:bg-[var(--color-blue)] group-active:bg-[var(--color-blue)]
          group-data-[resize-handle-active]:bg-[var(--color-blue)]
          transition-colors duration-150"
      />
    </Separator>
  );
}

/** Convert a Layout map (keyed by panel id) to the ordered array we store. */
function horizontalLayoutToArray(layout: Layout): number[] {
  return [
    layout["primary-sidebar"] ?? 15,
    layout["center"] ?? 60,
    layout["right-panel"] ?? 25,
  ];
}

function verticalLayoutToArray(layout: Layout): number[] {
  return [
    layout["editor"] ?? 70,
    layout["bottom-panel"] ?? 30,
  ];
}

/** Convert stored array back to a Layout map for defaultLayout. */
function arrayToHorizontalLayout(arr: number[]): Layout {
  return {
    "primary-sidebar": arr[0] ?? 15,
    "center": arr[1] ?? 60,
    "right-panel": arr[2] ?? 25,
  };
}

function arrayToVerticalLayout(arr: number[]): Layout {
  return {
    "editor": arr[0] ?? 70,
    "bottom-panel": arr[1] ?? 30,
  };
}

export function IDELayout() {
  const viewMode = useLayoutStore((s) => s.viewMode);
  const primarySidebarVisible = useLayoutStore((s) => s.primarySidebarVisible);
  const secondarySidebarVisible = useLayoutStore((s) => s.secondarySidebarVisible);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const zenMode = useLayoutStore((s) => s.zenMode);
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
  const horizontalLayout = useLayoutStore((s) => s.horizontalLayout);
  const verticalLayout = useLayoutStore((s) => s.verticalLayout);
  const setHorizontalLayout = useLayoutStore((s) => s.setHorizontalLayout);
  const setVerticalLayout = useLayoutStore((s) => s.setVerticalLayout);

  // Panel refs for programmatic collapse/expand
  const primaryPanelRef = usePanelRef();
  const secondaryPanelRef = usePanelRef();
  const bottomPanelRef = usePanelRef();

  // Ctrl+Shift+Q — open Quick Question overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "Q") {
        e.preventDefault();
        useQuickQuestionStore.getState().open();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Ctrl+Shift+Z — toggle zen mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "Z" || e.key === "z")) {
        e.preventDefault();
        toggleZenMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleZenMode]);

  // Sync collapse/expand state with store visibility flags
  useEffect(() => {
    const panel = primaryPanelRef.current;
    if (!panel) return;
    if (primarySidebarVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [primarySidebarVisible, primaryPanelRef]);

  useEffect(() => {
    const panel = secondaryPanelRef.current;
    if (!panel) return;
    if (secondarySidebarVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [secondarySidebarVisible, secondaryPanelRef]);

  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (panelVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [panelVisible, bottomPanelRef]);

  // When panels are resized, detect if they cross the collapse threshold
  // and sync visibility back to the store.
  const handlePrimaryResize = useCallback(
    (size: { asPercentage: number }) => {
      const isCollapsed = size.asPercentage === 0;
      const s = useLayoutStore.getState();
      if (isCollapsed && s.primarySidebarVisible) {
        useLayoutStore.setState({ primarySidebarVisible: false });
      } else if (!isCollapsed && !s.primarySidebarVisible) {
        useLayoutStore.setState({ primarySidebarVisible: true });
      }
    },
    [],
  );

  const handleSecondaryResize = useCallback(
    (size: { asPercentage: number }) => {
      const isCollapsed = size.asPercentage === 0;
      const s = useLayoutStore.getState();
      if (isCollapsed && s.secondarySidebarVisible) {
        useLayoutStore.setState({ secondarySidebarVisible: false });
      } else if (!isCollapsed && !s.secondarySidebarVisible) {
        useLayoutStore.setState({ secondarySidebarVisible: true });
      }
    },
    [],
  );

  const handleBottomResize = useCallback(
    (size: { asPercentage: number }) => {
      const isCollapsed = size.asPercentage === 0;
      const s = useLayoutStore.getState();
      if (isCollapsed && s.panelVisible) {
        useLayoutStore.setState({ panelVisible: false });
      } else if (!isCollapsed && !s.panelVisible) {
        useLayoutStore.setState({ panelVisible: true });
      }
    },
    [],
  );

  // Persist layout percentages when drag ends
  const handleHorizontalLayoutChanged = useCallback(
    (layout: Layout) => {
      setHorizontalLayout(horizontalLayoutToArray(layout));
    },
    [setHorizontalLayout],
  );

  const handleVerticalLayoutChanged = useCallback(
    (layout: Layout) => {
      setVerticalLayout(verticalLayoutToArray(layout));
    },
    [setVerticalLayout],
  );

  // Zen mode: show only the editor centered in the viewport
  if (zenMode) {
    return (
      <div
        className="flex flex-col h-screen w-screen overflow-hidden transition-all duration-300"
        style={{ backgroundColor: "var(--color-base)" }}
      >
        <div className="flex flex-1 items-stretch justify-center overflow-hidden">
          <div
            className="flex flex-col overflow-hidden w-full"
            style={{ maxWidth: "900px" }}
          >
            <EditorArea />
          </div>
        </div>
        <ZenModeOverlay />
      </div>
    );
  }

  // Claude View: chat-first layout with navigation strip
  if (viewMode === "claude") {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden" role="application" aria-label="Vantage IDE">
        <TitleBar />
        <ClaudeViewLayout />
        <StatusBar />
      </div>
    );
  }

  // IDE View: traditional editor layout
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" role="application" aria-label="Vantage IDE">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />

        {/* Main content: horizontal Group with 3 panels
            Structure: [PrimarySidebar | Center(Editor+BottomPanel) | RightPanel(Chat)]
            The right panel sits at the same level as the center column,
            so it spans full height from title bar to status bar. */}
        <div className="flex-1 overflow-hidden min-w-0">
          <Group
            orientation="horizontal"
            id="main-layout"
            defaultLayout={arrayToHorizontalLayout(horizontalLayout)}
            onLayoutChanged={handleHorizontalLayoutChanged}
          >
            {/* Primary Sidebar */}
            <Panel
              panelRef={primaryPanelRef}
              id="primary-sidebar"
              defaultSize={horizontalLayout[0] ?? 15}
              minSize={5}
              collapsible
              collapsedSize={0}
              onResize={handlePrimaryResize}
            >
              <div className="h-full overflow-hidden min-w-0">
                <PrimarySidebar />
              </div>
            </Panel>

            <HorizontalSeparator />

            {/* Center column: Editor + Bottom Panel stacked vertically */}
            <Panel
              id="center"
              defaultSize={horizontalLayout[1] ?? 60}
              minSize={20}
            >
              <Group
                orientation="vertical"
                id="center-vertical"
                defaultLayout={arrayToVerticalLayout(verticalLayout)}
                onLayoutChanged={handleVerticalLayoutChanged}
              >
                <Panel
                  id="editor"
                  defaultSize={verticalLayout[0] ?? 70}
                  minSize={15}
                >
                  <div className="h-full overflow-hidden min-w-0 min-h-0">
                    <EditorArea />
                  </div>
                </Panel>

                <VerticalSeparator />

                <Panel
                  panelRef={bottomPanelRef}
                  id="bottom-panel"
                  defaultSize={verticalLayout[1] ?? 30}
                  minSize={5}
                  collapsible
                  collapsedSize={0}
                  onResize={handleBottomResize}
                >
                  <div className="h-full overflow-hidden min-w-0 min-h-0">
                    <PanelArea />
                  </div>
                </Panel>
              </Group>
            </Panel>

            <HorizontalSeparator />

            {/* Secondary Sidebar (Chat) — full height, same level as center column */}
            <Panel
              panelRef={secondaryPanelRef}
              id="right-panel"
              defaultSize={horizontalLayout[2] ?? 25}
              minSize={5}
              collapsible
              collapsedSize={0}
              onResize={handleSecondaryResize}
            >
              <div className="h-full overflow-hidden min-w-0">
                <SecondarySidebar />
              </div>
            </Panel>
          </Group>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
