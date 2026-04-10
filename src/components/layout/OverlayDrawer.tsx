import { useEffect, useCallback, useState, useRef } from "react";
import { useLayoutStore } from "@/stores/layout";
import { PrimarySidebar } from "./PrimarySidebar";

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 300;

export function OverlayDrawer() {
  const overlayDrawerItem = useLayoutStore((s) => s.overlayDrawerItem);
  const setOverlayDrawerItem = useLayoutStore((s) => s.setOverlayDrawerItem);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isVisible, setIsVisible] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  const isOpen = overlayDrawerItem !== null;

  // Animate in after mount when drawer opens
  useEffect(() => {
    if (isOpen) {
      // Delay to allow the initial translateX(-100%) to render before animating in
      const frame = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Escape key dismissal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOverlayDrawerItem(null);
      }
    },
    [setOverlayDrawerItem],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Resize handle: mouse events
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const delta = moveEvent.clientX - startXRef.current;
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidthRef.current + delta),
        );
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20,
          backgroundColor: "rgba(0,0,0,0.3)",
        }}
        onClick={() => setOverlayDrawerItem(null)}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: `${width}px`,
          zIndex: 30,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--color-mantle)",
          borderRight: "1px solid var(--color-surface-0)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          transform: isVisible ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 200ms ease-out",
        }}
      >
        {/* Sidebar content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PrimarySidebar />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "3px",
            cursor: "col-resize",
            zIndex: 31,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--color-blue)";
          }}
          onMouseLeave={(e) => {
            if (!isDraggingRef.current) {
              (e.currentTarget as HTMLDivElement).style.backgroundColor =
                "transparent";
            }
          }}
        />
      </div>
    </>
  );
}
