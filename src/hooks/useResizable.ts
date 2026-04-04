import { useCallback, useRef, useState } from "react";

interface UseResizableOptions {
  initialSize: number;
  minSize: number;
  maxSize: number;
  direction: "left" | "right"; // which side the handle is on relative to the panel
}

export function useResizable({
  initialSize,
  minSize,
  maxSize,
  direction,
}: UseResizableOptions) {
  const [size, setSize] = useState(initialSize);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startSize = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      startX.current = e.clientX;
      startSize.current = size;

      const onMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return;
        const delta =
          direction === "right"
            ? e.clientX - startX.current
            : startX.current - e.clientX;
        const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + delta));
        setSize(newSize);
      };

      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [size, minSize, maxSize, direction]
  );

  return { size, onMouseDown };
}
