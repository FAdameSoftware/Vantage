import { useRef, useState, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  X,
  Globe,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";

// ── Dev server URL detection ──────────────────────────────────────────

const DEV_SERVER_PATTERNS = [
  /Local:\s+(https?:\/\/localhost:\d+)/,
  /listening on\s+(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+)/i,
  /ready on\s+(https?:\/\/localhost:\d+)/i,
  /Server running at\s+(https?:\/\/localhost:\d+)/i,
  /started server on\s+.+,\s+url:\s+(https?:\/\/localhost:\d+)/i,
  /http:\/\/localhost:(\d+)/,
];

export function detectDevServerUrl(terminalOutput: string): string | null {
  for (const pattern of DEV_SERVER_PATTERNS) {
    const match = terminalOutput.match(pattern);
    if (match) {
      return match[1].startsWith("http")
        ? match[1]
        : `http://localhost:${match[1]}`;
    }
  }
  return null;
}

// ── BrowserPreview component ──────────────────────────────────────────

export function BrowserPreview() {
  const previewUrl = useLayoutStore((s) => s.previewUrl);
  const setPreviewUrl = useLayoutStore((s) => s.setPreviewUrl);
  const setPreviewActive = useLayoutStore((s) => s.setPreviewActive);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [urlInput, setUrlInput] = useState(
    previewUrl ?? "http://localhost:3000"
  );
  const [isLoading, setIsLoading] = useState(false);

  // Navigate the iframe to a new URL
  const navigate = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;
      // Ensure URL has a protocol
      const normalized =
        trimmed.startsWith("http://") || trimmed.startsWith("https://")
          ? trimmed
          : `http://${trimmed}`;
      setPreviewUrl(normalized);
      setUrlInput(normalized);
    },
    [setPreviewUrl]
  );

  const handleGoClick = useCallback(() => {
    navigate(urlInput);
  }, [navigate, urlInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        navigate(urlInput);
      }
    },
    [navigate, urlInput]
  );

  const handleRefresh = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Toggle src to force reload
    const current = previewUrl ?? "about:blank";
    iframe.src = "about:blank";
    setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = current;
      }
    }, 50);
  }, [previewUrl]);

  const handleBack = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {
      // Cross-origin restriction – silently ignore
    }
  }, []);

  const handleForward = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {
      // Cross-origin restriction – silently ignore
    }
  }, []);

  const handleClose = useCallback(() => {
    setPreviewActive(false);
  }, [setPreviewActive]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    // Sync URL bar with iframe's actual location (same-origin only)
    try {
      const actual = iframeRef.current?.contentWindow?.location.href;
      if (actual && actual !== "about:blank") {
        setUrlInput(actual);
      }
    } catch {
      // Cross-origin – leave urlInput as-is
    }
  }, []);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 h-9 shrink-0"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {/* Navigation buttons */}
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-40"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={handleBack}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>

        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-40"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={handleForward}
          aria-label="Forward"
          title="Forward"
        >
          <ArrowRight size={14} />
        </button>

        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={handleRefresh}
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>

        {/* URL input */}
        <div className="flex-1 flex items-center gap-1.5 px-2 h-6 rounded"
          style={{
            backgroundColor: "var(--color-base)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <Globe size={11} style={{ color: "var(--color-overlay-0)", flexShrink: 0 }} />
          <input
            type="text"
            className="flex-1 bg-transparent text-xs outline-none min-w-0"
            style={{ color: "var(--color-text)" }}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            aria-label="URL"
            placeholder="http://localhost:3000"
          />
        </div>

        {/* Go button */}
        <button
          className="flex items-center justify-center px-2 h-6 text-xs rounded hover:bg-[var(--color-blue)] transition-colors font-medium"
          style={{
            backgroundColor: "var(--color-surface-1)",
            color: "var(--color-text)",
          }}
          onClick={handleGoClick}
          aria-label="Navigate"
        >
          Go
        </button>

        {/* Close button */}
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors ml-1"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={handleClose}
          aria-label="Close Preview"
          title="Close Preview"
        >
          <X size={14} />
        </button>
      </div>

      {/* iframe content */}
      {previewUrl ? (
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="w-full flex-1 border-0"
          style={{ backgroundColor: "white" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          title="Browser Preview"
          onLoad={handleLoad}
          onError={() => setIsLoading(false)}
        />
      ) : (
        <div
          className="flex flex-col items-center justify-center flex-1 gap-3"
          style={{ color: "var(--color-overlay-1)" }}
        >
          <Globe size={32} style={{ color: "var(--color-overlay-0)" }} />
          <p className="text-sm text-center max-w-xs leading-relaxed">
            No preview active. Enter a URL or start a dev server to see a live
            preview.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="px-3 h-7 text-xs rounded outline-none"
              style={{
                backgroundColor: "var(--color-surface-0)",
                border: "1px solid var(--color-surface-1)",
                color: "var(--color-text)",
                width: 220,
              }}
              placeholder="http://localhost:3000"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="px-3 h-7 text-xs rounded transition-colors"
              style={{
                backgroundColor: "var(--color-blue)",
                color: "var(--color-base)",
              }}
              onClick={handleGoClick}
            >
              Open
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
