import { useCallback, useRef, useState } from "react";

interface UseResizableOptions {
  initialSize: number;
  minSize: number;
  maxSize: number;
  direction: "left" | "right"; // which side the handle is on relative to the panel
  /** Optional callback fired when the user finishes a drag (mouseup) with the final size */
  onSizeChange?: (size: number) => void;
}

export function useResizable({
  initialSize,
  minSize,
  maxSize,
  direction,
  onSizeChange,
}: UseResizableOptions) {
  const [size, setSize] = useState(initialSize);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startSize = useRef(0);
  // Track the most recent calculated size so onMouseUp can read it without closure stale state
  const currentSizeRef = useRef(initialSize);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      startX.current = e.clientX;
      startSize.current = size;
      currentSizeRef.current = size;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;
        const delta =
          direction === "right"
            ? moveEvent.clientX - startX.current
            : startX.current - moveEvent.clientX;
        const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + delta));
        currentSizeRef.current = newSize;
        setSize(newSize);
      };

      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Notify caller with the final size for persistence
        onSizeChange?.(currentSizeRef.current);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [size, minSize, maxSize, direction, onSizeChange],
  );

  return { size, onMouseDown };
}
