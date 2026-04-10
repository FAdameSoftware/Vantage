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
import { CommandSidebar } from "./CommandSidebar";
import { OverlayDrawer } from "./OverlayDrawer";
import { ChatPanel } from "@/components/chat/ChatPanel";
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

// ── Command Center center content ─────────────────────────────────

function CommandCenterContent() {
  return (
    <Group
      orientation="horizontal"
      id="cc-horizontal"
      defaultLayout={{ "cc-chat": 62, "cc-sidebar": 38 }}
    >
      <Panel id="cc-chat" defaultSize={62} minSize={30}>
        <div className="h-full overflow-hidden min-w-0 min-h-0">
          <ChatPanel mode="full" />
        </div>
      </Panel>

      <HorizontalSeparator />

      <Panel id="cc-sidebar" defaultSize={38} minSize={15}>
        <div className="h-full overflow-hidden min-w-0">
          <CommandSidebar />
        </div>
      </Panel>
    </Group>
  );
}

// ── Copilot center content ────────────────────────────────────────

function CopilotContent({
  primaryPanelRef,
  secondaryPanelRef,
  horizontalLayout,
  onHorizontalLayoutChanged,
  onPrimaryResize,
  onSecondaryResize,
}: {
  primaryPanelRef: React.Ref<import("react-resizable-panels").PanelImperativeHandle>;
  secondaryPanelRef: React.Ref<import("react-resizable-panels").PanelImperativeHandle>;
  horizontalLayout: number[];
  onHorizontalLayoutChanged: (layout: Layout) => void;
  onPrimaryResize: (size: { asPercentage: number }) => void;
  onSecondaryResize: (size: { asPercentage: number }) => void;
}) {
  return (
    <Group
      orientation="horizontal"
      id="main-layout"
      defaultLayout={arrayToHorizontalLayout(horizontalLayout)}
      onLayoutChanged={onHorizontalLayoutChanged}
    >
      {/* Primary Sidebar */}
      <Panel
        panelRef={primaryPanelRef}
        id="primary-sidebar"
        defaultSize={horizontalLayout[0] ?? 15}
        minSize={5}
        collapsible
        collapsedSize={0}
        onResize={onPrimaryResize}
      >
        <div className="h-full overflow-hidden min-w-0">
          <PrimarySidebar />
        </div>
      </Panel>

      <HorizontalSeparator />

      {/* Center: Editor */}
      <Panel
        id="center"
        defaultSize={horizontalLayout[1] ?? 60}
        minSize={20}
      >
        <div className="h-full overflow-hidden min-w-0 min-h-0">
          <EditorArea />
        </div>
      </Panel>

      <HorizontalSeparator />

      {/* Secondary Sidebar (Chat) */}
      <Panel
        panelRef={secondaryPanelRef}
        id="right-panel"
        defaultSize={horizontalLayout[2] ?? 25}
        minSize={5}
        collapsible
        collapsedSize={0}
        onResize={onSecondaryResize}
      >
        <div className="h-full overflow-hidden min-w-0">
          <SecondarySidebar />
        </div>
      </Panel>
    </Group>
  );
}

// ── Main Layout ───────────────────────────────────────────────────

export function AppLayout() {
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
  const overlayDrawerItem = useLayoutStore((s) => s.overlayDrawerItem);

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

  // Sync sidebar collapse/expand state with store (copilot mode only)
  useEffect(() => {
    if (viewMode !== "copilot") return;
    const panel = primaryPanelRef.current;
    if (!panel) return;
    if (primarySidebarVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [primarySidebarVisible, primaryPanelRef, viewMode]);

  useEffect(() => {
    if (viewMode !== "copilot") return;
    const panel = secondaryPanelRef.current;
    if (!panel) return;
    if (secondarySidebarVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [secondarySidebarVisible, secondaryPanelRef, viewMode]);

  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (panelVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [panelVisible, bottomPanelRef]);

  // Sync resize back to store
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />

        {/* Overlay drawer for activity bar items in command-center mode */}
        {viewMode === "command-center" && overlayDrawerItem && (
          <OverlayDrawer />
        )}

        {/* Main content: vertical group [mode-content | bottom-panel] */}
        <div className="flex-1 overflow-hidden min-w-0">
          <Group
            orientation="vertical"
            id="outer-vertical"
            defaultLayout={arrayToVerticalLayout(verticalLayout)}
            onLayoutChanged={handleVerticalLayoutChanged}
          >
            {/* Mode-specific center content */}
            <Panel
              id="editor"
              defaultSize={verticalLayout[0] ?? 70}
              minSize={15}
            >
              <div className="h-full overflow-hidden min-w-0 min-h-0">
                {viewMode === "command-center" ? (
                  <CommandCenterContent />
                ) : (
                  <CopilotContent
                    primaryPanelRef={primaryPanelRef}
                    secondaryPanelRef={secondaryPanelRef}
                    horizontalLayout={horizontalLayout}
                    onHorizontalLayoutChanged={handleHorizontalLayoutChanged}
                    onPrimaryResize={handlePrimaryResize}
                    onSecondaryResize={handleSecondaryResize}
                  />
                )}
              </div>
            </Panel>

            <VerticalSeparator />

            {/* Bottom Panel (terminal, browser, verification) — shared across modes */}
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
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
