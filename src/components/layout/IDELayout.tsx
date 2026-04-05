import { useEffect, useCallback } from "react";
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
import { ZenModeOverlay } from "./ZenModeOverlay";
import { useQuickQuestionStore } from "@/stores/quickQuestion";

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
  const secondarySidebarVisible = useLayoutStore((s) => s.secondarySidebarVisible);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const zenMode = useLayoutStore((s) => s.zenMode);
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
  const primarySidebarPixelWidth = useLayoutStore((s) => s.primarySidebarPixelWidth);
  const secondarySidebarPixelWidth = useLayoutStore((s) => s.secondarySidebarPixelWidth);
  const setPrimarySidebarPixelWidth = useLayoutStore((s) => s.setPrimarySidebarPixelWidth);
  const setSecondarySidebarPixelWidth = useLayoutStore((s) => s.setSecondarySidebarPixelWidth);

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

  const handlePrimaryWidthChange = useCallback(
    (w: number) => setPrimarySidebarPixelWidth(w),
    [setPrimarySidebarPixelWidth],
  );

  const handleSecondaryWidthChange = useCallback(
    (w: number) => setSecondarySidebarPixelWidth(w),
    [setSecondarySidebarPixelWidth],
  );

  const primarySidebar = useResizable({
    initialSize: primarySidebarPixelWidth,
    minSize: 180,
    maxSize: 400,
    direction: "right",
    onSizeChange: handlePrimaryWidthChange,
  });

  const secondarySidebar = useResizable({
    initialSize: secondarySidebarPixelWidth,
    minSize: 220,
    maxSize: 500,
    direction: "left",
    onSizeChange: handleSecondaryWidthChange,
  });

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
