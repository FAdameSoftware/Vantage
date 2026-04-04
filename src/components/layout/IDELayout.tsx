import {
  Panel,
  Group,
  Separator,
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
  const secondarySidebarVisible = useLayoutStore(
    (s) => s.secondarySidebarVisible
  );
  const panelVisible = useLayoutStore((s) => s.panelVisible);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />

        {/* Main layout using plain flexbox instead of react-resizable-panels
            for the top-level split. The library's persistence was corrupting
            panel sizes. We use CSS min/max-width for constraints. */}
        <div className="flex flex-1 overflow-hidden">
          {/* Primary Sidebar */}
          {primarySidebarVisible && (
            <>
              <div
                className="shrink-0 overflow-hidden"
                style={{ width: 240, minWidth: 180, maxWidth: 400 }}
              >
                <PrimarySidebar />
              </div>
              <div
                className="w-[1px] shrink-0 cursor-col-resize hover:bg-[var(--color-blue)] transition-colors"
                style={{ backgroundColor: "var(--color-surface-0)" }}
              />
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
                  <ResizeHandle orientation="vertical" />
                  <Panel
                    id="panel"
                    defaultSize={30}
                    minSize={10}
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
              <div
                className="w-[1px] shrink-0 cursor-col-resize hover:bg-[var(--color-blue)] transition-colors"
                style={{ backgroundColor: "var(--color-surface-0)" }}
              />
              <div
                className="shrink-0 overflow-hidden"
                style={{ width: 300, minWidth: 220, maxWidth: 500 }}
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
