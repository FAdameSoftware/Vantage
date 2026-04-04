import {
  Panel,
  Group,
  Separator,
  PanelSize,
  useDefaultLayout,
} from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout";
import { ActivityBar } from "./ActivityBar";
import { PrimarySidebar } from "./PrimarySidebar";
import { EditorArea } from "./EditorArea";
import { SecondarySidebar } from "./SecondarySidebar";
import { PanelArea } from "./PanelArea";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";

function ResizeHandle({
  orientation = "horizontal",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  const isHorizontal = orientation === "horizontal";
  return (
    <Separator
      className={`
        group relative
        ${isHorizontal ? "w-[1px]" : "h-[1px]"}
        transition-colors duration-150
      `}
      style={{ backgroundColor: "var(--color-surface-0)" }}
    >
      <div
        className={`
          absolute z-10
          ${isHorizontal
            ? "top-0 bottom-0 -left-[1px] -right-[1px] w-[3px] cursor-col-resize"
            : "left-0 right-0 -top-[1px] -bottom-[1px] h-[3px] cursor-row-resize"
          }
          group-hover:bg-[var(--color-blue)] group-active:bg-[var(--color-blue)]
          group-data-[resize-handle-active]:bg-[var(--color-blue)]
          transition-colors duration-150
        `}
      />
    </Separator>
  );
}

export function IDELayout() {
  const primarySidebarVisible = useLayoutStore((s) => s.primarySidebarVisible);
  const secondarySidebarVisible = useLayoutStore((s) => s.secondarySidebarVisible);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const setPrimarySidebarSize = useLayoutStore((s) => s.setPrimarySidebarSize);
  const setSecondarySidebarSize = useLayoutStore((s) => s.setSecondarySidebarSize);
  const setPanelSize = useLayoutStore((s) => s.setPanelSize);

  const mainLayout = useDefaultLayout({ id: "vantage-main-horizontal", storage: localStorage });
  const centerLayout = useDefaultLayout({ id: "vantage-center-vertical", storage: localStorage });

  const handlePrimarySidebarResize = (panelSize: PanelSize) => {
    setPrimarySidebarSize(panelSize.asPercentage);
  };

  const handleSecondarySidebarResize = (panelSize: PanelSize) => {
    setSecondarySidebarSize(panelSize.asPercentage);
  };

  const handlePanelResize = (panelSize: PanelSize) => {
    setPanelSize(panelSize.asPercentage);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Title Bar */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar (fixed width, never resizable) */}
        <ActivityBar />

        {/* Resizable panels */}
        <Group
          orientation="horizontal"
          className="flex-1"
          defaultLayout={mainLayout.defaultLayout}
          onLayoutChanged={mainLayout.onLayoutChanged}
        >
          {/* Primary Sidebar */}
          {primarySidebarVisible && (
            <>
              <Panel
                id="primary-sidebar"
                defaultSize={20}
                minSize={12}
                maxSize={40}
                collapsible
                collapsedSize={0}
                onResize={handlePrimarySidebarResize}
              >
                <PrimarySidebar />
              </Panel>
              <ResizeHandle orientation="horizontal" />
            </>
          )}

          {/* Center area: Editor + Panel stacked vertically */}
          <Panel id="center" minSize={30}>
            <Group
              orientation="vertical"
              defaultLayout={centerLayout.defaultLayout}
              onLayoutChanged={centerLayout.onLayoutChanged}
            >
              {/* Editor Area */}
              <Panel id="editor" minSize={20}>
                <EditorArea />
              </Panel>

              {/* Bottom Panel */}
              {panelVisible && (
                <>
                  <ResizeHandle orientation="vertical" />
                  <Panel
                    id="panel"
                    defaultSize={30}
                    minSize={10}
                    maxSize={70}
                    collapsible
                    collapsedSize={0}
                    onResize={handlePanelResize}
                  >
                    <PanelArea />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>

          {/* Secondary Sidebar (Chat) */}
          {secondarySidebarVisible && (
            <>
              <ResizeHandle orientation="horizontal" />
              <Panel
                id="secondary-sidebar"
                defaultSize={25}
                minSize={15}
                maxSize={45}
                collapsible
                collapsedSize={0}
                onResize={handleSecondarySidebarResize}
              >
                <SecondarySidebar />
              </Panel>
            </>
          )}
        </Group>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}
