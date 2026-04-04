import { useEffect } from "react";
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

  // Re-fit when becoming visible or when container resizes
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure container has its final dimensions
      const timer = setTimeout(() => fit(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fit]);

  // Listen for container resize via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (isVisible) {
        fit();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
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
