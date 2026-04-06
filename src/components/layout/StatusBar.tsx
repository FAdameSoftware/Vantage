import { useState, useEffect } from "react";
import {
  AlertTriangle,
  XCircle,
  Database,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layout";
import {
  GitInfo,
  EditorInfo,
  SessionInfo,
  StatusBarBuddyWidget,
  NotificationIndicator,
} from "./status-bar";

/** Track window width for responsive status bar priority tiers */
function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1920,
  );
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

export function StatusBar() {
  const windowWidth = useWindowWidth();
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const [isIndexed, setIsIndexed] = useState(false);

  useEffect(() => {
    if (!projectRootPath) return;
    invoke<unknown>("get_project_index", { rootPath: projectRootPath })
      .then((idx) => setIsIndexed(idx !== null))
      .catch(() => setIsIndexed(false));
  }, [projectRootPath]);

  const handleErrorsClick = () => {
    setActiveActivityBarItem("search");
  };

  return (
    <div className="relative">
      <div
        className="flex items-center justify-between h-[22px] px-2.5 text-[11px] shrink-0 select-none"
        style={{
          backgroundColor: "var(--color-crust)",
          color: "var(--color-subtext-0)",
          borderTop: "1px solid var(--color-surface-0)",
        }}
        role="status"
        aria-label="Status Bar"
      >
        {/* Left side - workspace scoped */}
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {/* Git branch + diff stats */}
          <GitInfo windowWidth={windowWidth} />

          {/* Errors and warnings -> click focuses search panel */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
              aria-label="0 errors. Click to open problems."
              onClick={handleErrorsClick}
              title="Open Problems"
            >
              <XCircle size={12} style={{ color: "var(--color-red)" }} />
              <span>0</span>
            </button>
            <button
              className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
              aria-label="0 warnings. Click to open problems."
              onClick={handleErrorsClick}
              title="Open Problems"
            >
              <AlertTriangle size={12} style={{ color: "var(--color-yellow)" }} />
              <span>0</span>
            </button>
          </div>

          {/* Coding buddy — Inkwell */}
          <StatusBarBuddyWidget windowWidth={windowWidth} />

          {/* Notification bell */}
          <NotificationIndicator windowWidth={windowWidth} />

          {/* Index status — hidden below 1200px */}
          {windowWidth >= 1200 && (
            <div
              className="flex items-center gap-0.5 shrink-0"
              title={isIndexed ? "Project indexed" : "Project not indexed"}
            >
              <Database
                size={11}
                style={{
                  color: isIndexed
                    ? "var(--color-green)"
                    : "var(--color-overlay-0)",
                }}
              />
            </div>
          )}
        </div>

        {/* Right side - file/session scoped */}
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          {/* Editor info: vim mode, line/col, EOL, encoding, tab size, auto-save, word wrap, language */}
          <EditorInfo windowWidth={windowWidth} />

          {/* Session info: status, usage, effort, model */}
          <SessionInfo windowWidth={windowWidth} />
        </div>
      </div>
    </div>
  );
}
