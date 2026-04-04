import { useState, useEffect } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

// Dynamic import to avoid errors outside Tauri context
let tauriWindow: typeof import("@tauri-apps/api/window") | null = null;

async function loadTauriWindow() {
  try {
    tauriWindow = await import("@tauri-apps/api/window");
  } catch {
    // Not in Tauri context (e.g., running in browser during dev)
  }
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    loadTauriWindow().then(async () => {
      if (tauriWindow) {
        const appWindow = tauriWindow.getCurrentWindow();
        setIsMaximized(await appWindow.isMaximized());

        const unlisten = await appWindow.onResized(async () => {
          setIsMaximized(await appWindow.isMaximized());
        });

        return () => {
          unlisten();
        };
      }
    });
  }, []);

  const handleMinimize = async () => {
    if (tauriWindow) {
      const appWindow = tauriWindow.getCurrentWindow();
      await appWindow.minimize();
    }
  };

  const handleMaximize = async () => {
    if (tauriWindow) {
      const appWindow = tauriWindow.getCurrentWindow();
      await appWindow.toggleMaximize();
    }
  };

  const handleClose = async () => {
    if (tauriWindow) {
      const appWindow = tauriWindow.getCurrentWindow();
      await appWindow.close();
    }
  };

  const buttonBase =
    "flex items-center justify-center w-12 h-full transition-colors";

  return (
    <div className="flex items-center h-full ml-auto">
      {/* Minimize */}
      <button
        className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
        onClick={handleMinimize}
        aria-label="Minimize"
        style={{ color: "var(--color-subtext-0)" }}
      >
        <Minus size={14} />
      </button>

      {/* Maximize/Restore */}
      <button
        className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
        onClick={handleMaximize}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        style={{ color: "var(--color-subtext-0)" }}
      >
        {isMaximized ? <Copy size={12} /> : <Square size={12} />}
      </button>

      {/* Close */}
      <button
        className={`${buttonBase} hover:bg-[var(--color-red)] hover:text-white`}
        onClick={handleClose}
        aria-label="Close"
        style={{ color: "var(--color-subtext-0)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TitleBar() {
  return (
    <div
      className="flex items-center h-8 shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Drag region - takes all available space */}
      <div
        className="flex items-center flex-1 h-full px-3"
        data-tauri-drag-region
      >
        {/* App icon and title */}
        <span
          className="text-xs font-medium pointer-events-none"
          style={{ color: "var(--color-subtext-0)" }}
          data-tauri-drag-region
        >
          Vantage
        </span>
      </div>

      {/* Window controls (not draggable) */}
      <WindowControls />
    </div>
  );
}
