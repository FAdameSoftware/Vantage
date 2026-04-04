/**
 * DevPanel — Debug overlay visible only in development mode.
 *
 * Shows all Zustand store states as collapsible JSON, component render
 * counts, the last error (if any), current layout state, active tab info,
 * and a "Dump State" button that downloads state as JSON.
 *
 * Toggle with Ctrl+Shift+D or by clicking the floating badge.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { useConversationStore } from "@/stores/conversation";

// Only render in development
const IS_DEV = import.meta.env.DEV;

interface StoreSection {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getData: () => Record<string, any>;
}

function CollapsibleJSON({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        paddingBottom: 4,
        marginBottom: 4,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          color: "#7dd3fc",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 11,
          padding: "2px 0",
          textAlign: "left",
          width: "100%",
        }}
      >
        {open ? "\u25BC" : "\u25B6"} {label}
      </button>
      {open && (
        <pre
          style={{
            fontSize: 10,
            color: "#d4d4d4",
            margin: "2px 0 0 12px",
            maxHeight: 300,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {JSON.stringify(data, serializeReplacer, 2)}
        </pre>
      )}
    </div>
  );
}

/** JSON replacer that handles Maps, Sets, and functions */
function serializeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  if (typeof value === "function") return "[Function]";
  return value;
}

function stripActions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v !== "function") result[k] = v;
  }
  return result;
}

export function DevPanel() {
  const [visible, setVisible] = useState(false);
  const renderCount = useRef(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  renderCount.current += 1;

  // Refresh store snapshots every second when the panel is open
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Capture global errors
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      setLastError(event.message);
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      setLastError(String(event.reason));
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rejectionHandler);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  // Toggle with Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const dumpState = useCallback(() => {
    const state = {
      layout: stripActions(useLayoutStore.getState()),
      editor: stripActions(useEditorStore.getState()),
      settings: stripActions(useSettingsStore.getState()),
      conversation: stripActions(useConversationStore.getState()),
      timestamp: new Date().toISOString(),
      renderCount: renderCount.current,
      lastError,
    };
    const blob = new Blob(
      [JSON.stringify(state, serializeReplacer, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vantage-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lastError]);

  if (!IS_DEV) return null;

  // Suppress the unused-variable lint for `tick` — it's used to trigger re-renders
  void tick;

  const stores: StoreSection[] = [
    { name: "Layout", getData: () => stripActions(useLayoutStore.getState()) },
    { name: "Editor", getData: () => stripActions(useEditorStore.getState()) },
    {
      name: "Settings",
      getData: () => stripActions(useSettingsStore.getState()),
    },
    {
      name: "Conversation",
      getData: () => stripActions(useConversationStore.getState()),
    },
  ];

  // Floating badge (always visible when DevPanel is available)
  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        data-testid="dev-panel-toggle"
        style={{
          position: "fixed",
          bottom: 28,
          left: 8,
          zIndex: 99999,
          background: "rgba(30,30,40,0.85)",
          color: "#7dd3fc",
          border: "1px solid rgba(125,211,252,0.3)",
          borderRadius: 4,
          padding: "2px 6px",
          fontSize: 10,
          fontFamily: "monospace",
          cursor: "pointer",
        }}
      >
        DEV
      </button>
    );
  }

  return (
    <div
      data-testid="dev-panel"
      style={{
        position: "fixed",
        top: 32,
        right: 8,
        width: 360,
        maxHeight: "calc(100vh - 64px)",
        overflow: "auto",
        zIndex: 99999,
        background: "rgba(15,15,25,0.95)",
        border: "1px solid rgba(125,211,252,0.2)",
        borderRadius: 6,
        padding: 8,
        fontFamily: "monospace",
        fontSize: 11,
        color: "#d4d4d4",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: "#7dd3fc", fontWeight: 600, fontSize: 12 }}>
          Dev Panel
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={dumpState}
            style={{
              background: "rgba(125,211,252,0.15)",
              border: "1px solid rgba(125,211,252,0.3)",
              color: "#7dd3fc",
              borderRadius: 3,
              padding: "1px 6px",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Dump State
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* Quick info */}
      <div style={{ marginBottom: 6, fontSize: 10, color: "#888" }}>
        Renders: {renderCount.current} | Active tab:{" "}
        {useEditorStore.getState().activeTabId ?? "none"}
      </div>

      {/* Last error */}
      {lastError && (
        <div
          style={{
            background: "rgba(255,50,50,0.15)",
            border: "1px solid rgba(255,50,50,0.3)",
            borderRadius: 3,
            padding: "4px 6px",
            marginBottom: 6,
            fontSize: 10,
            color: "#ff8888",
            wordBreak: "break-all",
          }}
        >
          Last error: {lastError}
        </div>
      )}

      {/* Store sections */}
      {stores.map((s) => (
        <CollapsibleJSON key={s.name} label={s.name} data={s.getData()} />
      ))}
    </div>
  );
}
