import { useEffect, useRef } from "react";
import { useTerminal } from "@/hooks/useTerminal";

interface TerminalInstanceProps {
  /** Shell executable path */
  shellPath: string;
  /** Shell arguments */
  shellArgs: string[];
  /** Working directory */
  cwd?: string;
  /** Whether this terminal is the currently visible one */
  isVisible: boolean;
}

export function TerminalInstance({
  shellPath,
  shellArgs,
  cwd,
  isVisible,
}: TerminalInstanceProps) {
  const { containerRef, fit } = useTerminal({
    shellPath,
    shellArgs,
    cwd,
  });
  const rafRef = useRef<number | null>(null);

  // Debounced fit to avoid calling fitAddon.fit() on every frame during a drag resize
  const debouncedFit = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      fit();
      rafRef.current = null;
    });
  };

  // Re-fit when becoming visible
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure container has its final dimensions after show
      const timer = setTimeout(() => fit(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fit]);

  // Listen for container resize via ResizeObserver — handles panel drag resizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isVisible) {
        debouncedFit();
      }
    });

    observer.observe(container);

    // Also observe the parent element to catch cases where the panel area
    // resizes but the terminal container dimensions haven't updated yet
    const parent = container.parentElement;
    if (parent) {
      observer.observe(parent);
    }

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isVisible, fit, containerRef]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        display: isVisible ? "block" : "none",
      }}
      data-allow-select="true"
    />
  );
}
