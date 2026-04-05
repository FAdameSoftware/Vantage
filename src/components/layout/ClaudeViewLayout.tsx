import { useCallback, useEffect } from "react";
import { Panel, Group, Separator, usePanelRef, type Layout } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout";
import { NavigationStrip } from "./NavigationStrip";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PanelArea } from "./PanelArea";

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

export function ClaudeViewLayout() {
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const bottomPanelRef = usePanelRef();

  // Sync panel collapse state with store
  useEffect(() => {
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (panelVisible) {
      if (panel.isCollapsed()) panel.expand();
    } else {
      if (!panel.isCollapsed()) panel.collapse();
    }
  }, [panelVisible, bottomPanelRef]);

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

  const handleLayoutChanged = useCallback(
    (_layout: Layout) => {
      // Claude view uses its own vertical layout — we don't persist this separately
      // to avoid conflicting with the IDE view's verticalLayout
    },
    [],
  );

  return (
    <div className="flex flex-1 overflow-hidden">
      <NavigationStrip />

      <div className="flex-1 overflow-hidden min-w-0">
        <Group
          orientation="vertical"
          id="claude-view-vertical"
          defaultLayout={{ "claude-chat": 75, "claude-panel": 25 }}
          onLayoutChanged={handleLayoutChanged}
        >
          {/* Chat area — full width, centered content */}
          <Panel
            id="claude-chat"
            defaultSize={75}
            minSize={30}
          >
            <div className="h-full overflow-hidden min-w-0 min-h-0">
              <ChatPanel mode="full" />
            </div>
          </Panel>

          <VerticalSeparator />

          {/* Bottom panel (terminal, etc.) — collapsible */}
          <Panel
            panelRef={bottomPanelRef}
            id="claude-panel"
            defaultSize={25}
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
  );
}
