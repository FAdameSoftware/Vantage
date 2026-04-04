import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout";
import { useResizable } from "@/hooks/useResizable";
import { ActivityBar } from "./ActivityBar";
import { PrimarySidebar } from "./PrimarySidebar";
import { EditorArea } from "./EditorArea";
import { SecondarySidebar } from "./SecondarySidebar";
import { PanelArea } from "./PanelArea";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";

function VerticalResizeHandle() {
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

function HorizontalResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="w-[3px] shrink-0 cursor-col-resize group relative"
      onMouseDown={onMouseDown}
    >
      <div
        className="absolute inset-0 w-[1px] mx-auto transition-colors duration-150 group-hover:w-[3px] group-hover:mx-0 group-hover:bg-[var(--color-blue)]"
        style={{ backgroundColor: "var(--color-surface-0)" }}
      />
    </div>
  );
}

export function IDELayout() {
  const primarySidebarVisible = useLayoutStore((s) => s.primarySidebarVisible);
  const secondarySidebarVisible = useLayoutStore(
    (s) => s.secondarySidebarVisible
  );
  const panelVisible = useLayoutStore((s) => s.panelVisible);

  const primarySidebar = useResizable({
    initialSize: 240,
    minSize: 180,
    maxSize: 400,
    direction: "right",
  });

  const secondarySidebar = useResizable({
    initialSize: 300,
    minSize: 220,
    maxSize: 500,
    direction: "left",
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />

        <div className="flex flex-1 overflow-hidden">
          {/* Primary Sidebar */}
          {primarySidebarVisible && (
            <>
              <div
                className="shrink-0 overflow-hidden"
                style={{ width: primarySidebar.size }}
              >
                <PrimarySidebar />
              </div>
              <HorizontalResizeHandle onMouseDown={primarySidebar.onMouseDown} />
            </>
          )}

          {/* Center: Editor + Panel stacked vertically */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <Group orientation="vertical">
              <Panel id="editor" minSize={20}>
                <EditorArea />
              </Panel>

              {panelVisible && (
                <>
                  <VerticalResizeHandle />
                  <Panel
                    id="panel"
                    defaultSize={35}
                    minSize={15}
                    maxSize={70}
                  >
                    <PanelArea />
                  </Panel>
                </>
              )}
            </Group>
          </div>

          {/* Secondary Sidebar (Chat) */}
          {secondarySidebarVisible && (
            <>
              <HorizontalResizeHandle onMouseDown={secondarySidebar.onMouseDown} />
              <div
                className="shrink-0 overflow-hidden"
                style={{ width: secondarySidebar.size }}
              >
                <SecondarySidebar />
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
