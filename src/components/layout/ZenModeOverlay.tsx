import { useEffect, useState } from "react";
import { useLayoutStore } from "@/stores/layout";

/**
 * ZenModeOverlay — shows a brief "Press Escape to exit Zen Mode" hint when
 * zen mode is activated. The hint auto-fades after 3 seconds.
 */
export function ZenModeOverlay() {
  const zenMode = useLayoutStore((s) => s.zenMode);
  const toggleZenMode = useLayoutStore((s) => s.toggleZenMode);
  const [visible, setVisible] = useState(false);

  // Show hint briefly whenever zen mode becomes active
  useEffect(() => {
    if (!zenMode) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [zenMode]);

  // Escape exits zen mode
  useEffect(() => {
    if (!zenMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggleZenMode();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [zenMode, toggleZenMode]);

  if (!zenMode || !visible) return null;

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none
        transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="px-4 py-2 rounded-full text-xs font-medium shadow-lg"
        style={{
          backgroundColor: "var(--color-surface-1)",
          color: "var(--color-subtext-0)",
          border: "1px solid var(--color-overlay-0)",
        }}
      >
        Press <kbd
          className="font-mono px-1 py-0.5 rounded text-[11px]"
          style={{
            backgroundColor: "var(--color-surface-2)",
            color: "var(--color-text)",
          }}
        >Escape</kbd> or <kbd
          className="font-mono px-1 py-0.5 rounded text-[11px]"
          style={{
            backgroundColor: "var(--color-surface-2)",
            color: "var(--color-text)",
          }}
        >Ctrl+Shift+Z</kbd> to exit Zen Mode
      </div>
    </div>
  );
}
