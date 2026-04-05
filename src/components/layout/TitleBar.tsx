import { useState, useEffect } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    appWindow.isMaximized().then(setIsMaximized).catch((err) => {
      console.error("Failed to check window maximized state:", err);
    });

    let unlisten: (() => void) | undefined;
    appWindow
      .onResized(async () => {
        try {
          setIsMaximized(await appWindow.isMaximized());
        } catch (err) {
          console.error("Failed to update maximized state on resize:", err);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = () => {
    getCurrentWindow().minimize();
  };

  const handleMaximize = () => {
    getCurrentWindow().toggleMaximize();
  };

  const handleClose = () => {
    getCurrentWindow().close();
  };

  const buttonBase =
    "flex items-center justify-center w-12 h-full transition-colors";

  return (
    <div className="flex items-center h-full ml-auto">
      <button
        className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
        onClick={handleMinimize}
        aria-label="Minimize"
        style={{ color: "var(--color-subtext-0)" }}
      >
        <Minus size={14} />
      </button>

      <button
        className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
        onClick={handleMaximize}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        style={{ color: "var(--color-subtext-0)" }}
      >
        {isMaximized ? <Copy size={12} /> : <Square size={12} />}
      </button>

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
      <div
        className="flex items-center flex-1 h-full px-3"
        data-tauri-drag-region
      >
        <span
          className="text-xs font-medium pointer-events-none"
          style={{ color: "var(--color-subtext-0)" }}
          data-tauri-drag-region
        >
          Vantage
        </span>
      </div>

      <WindowControls />
    </div>
  );
}
