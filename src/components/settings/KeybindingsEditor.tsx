import { useState, useCallback, useEffect, useRef } from "react";
import { Search, RotateCcw, Pencil, X, Check } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";
import {
  DEFAULT_KEYBINDING_DEFINITIONS,
  formatShortcut,
  type KeybindingDefinition,
} from "@/hooks/useKeybindings";

/**
 * Parse a keyboard event into modifier+key components.
 * Returns null if only modifier keys are pressed (no primary key yet).
 */
function parseKeyboardEvent(e: KeyboardEvent): { key: string; ctrl: boolean; shift: boolean; alt: boolean } | null {
  // Ignore bare modifier presses
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  return {
    key: e.key === " " ? "Space" : e.key,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

interface RecordingState {
  keybindingId: string;
  preview: string;
}

export function KeybindingsEditor() {
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [pendingBinding, setPendingBinding] = useState<{
    id: string;
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
  } | null>(null);
  const recordInputRef = useRef<HTMLDivElement>(null);

  const keybindingOverrides = useSettingsStore((s) => s.keybindingOverrides);
  const setKeybindingOverride = useSettingsStore((s) => s.setKeybindingOverride);
  const removeKeybindingOverride = useSettingsStore((s) => s.removeKeybindingOverride);
  const resetAllKeybindings = useSettingsStore((s) => s.resetAllKeybindings);

  // Build the merged list of keybinding definitions with overrides applied
  const definitions: KeybindingDefinition[] = DEFAULT_KEYBINDING_DEFINITIONS.map((def) => {
    const override = keybindingOverrides[def.id];
    if (override) {
      return {
        ...def,
        key: override.key,
        ctrl: override.ctrl,
        shift: override.shift,
        alt: override.alt,
        source: "custom" as const,
      };
    }
    return { ...def, source: "built-in" as const };
  });

  // Filter by action name or shortcut
  const filtered = filter.trim()
    ? definitions.filter((d) => {
        const q = filter.toLowerCase();
        const shortcut = formatShortcut(d).toLowerCase();
        return d.description.toLowerCase().includes(q) || shortcut.includes(q);
      })
    : definitions;

  // Handle recording mode: listen for key presses
  useEffect(() => {
    if (!recording) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(null);
        setPendingBinding(null);
        return;
      }

      const parsed = parseKeyboardEvent(e);
      if (!parsed) return;

      const binding = {
        id: recording!.keybindingId,
        key: parsed.key,
        ctrl: parsed.ctrl || undefined,
        shift: parsed.shift || undefined,
        alt: parsed.alt || undefined,
      };

      setPendingBinding(binding);
      setRecording({
        ...recording!,
        preview: formatShortcut(parsed),
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording]);

  const startRecording = useCallback((keybindingId: string) => {
    setRecording({ keybindingId, preview: "Press keys..." });
    setPendingBinding(null);
  }, []);

  const confirmRecording = useCallback(() => {
    if (pendingBinding) {
      setKeybindingOverride(pendingBinding.id, {
        key: pendingBinding.key,
        ctrl: pendingBinding.ctrl,
        shift: pendingBinding.shift,
        alt: pendingBinding.alt,
      });
    }
    setRecording(null);
    setPendingBinding(null);
  }, [pendingBinding, setKeybindingOverride]);

  const cancelRecording = useCallback(() => {
    setRecording(null);
    setPendingBinding(null);
  }, []);

  const hasOverrides = Object.keys(keybindingOverrides).length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-overlay-1)" }}
          />
          <input
            type="text"
            placeholder="Search keybindings by action or shortcut..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded text-xs"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
              border: "1px solid var(--color-surface-1)",
              outline: "none",
            }}
          />
        </div>
        {hasOverrides && (
          <button
            type="button"
            onClick={resetAllKeybindings}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs hover:bg-[var(--color-surface-0)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            title="Reset all keybindings to defaults"
          >
            <RotateCcw size={12} />
            Reset All
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr
              className="sticky top-0"
              style={{
                backgroundColor: "var(--color-mantle)",
                borderBottom: "1px solid var(--color-surface-0)",
              }}
            >
              <th
                className="text-left px-4 py-2 font-medium"
                style={{ color: "var(--color-subtext-0)", width: "45%" }}
              >
                Command
              </th>
              <th
                className="text-left px-4 py-2 font-medium"
                style={{ color: "var(--color-subtext-0)", width: "30%" }}
              >
                Keybinding
              </th>
              <th
                className="text-left px-4 py-2 font-medium"
                style={{ color: "var(--color-subtext-0)", width: "12%" }}
              >
                Source
              </th>
              <th
                className="text-right px-4 py-2 font-medium"
                style={{ color: "var(--color-subtext-0)", width: "13%" }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((def) => {
              const isRecording = recording?.keybindingId === def.id;
              const isCustom = def.source === "custom";

              return (
                <tr
                  key={def.id}
                  className="hover:bg-[var(--color-surface-0)] transition-colors"
                  style={{
                    borderBottom: "1px solid var(--color-surface-0)",
                  }}
                >
                  {/* Command name */}
                  <td className="px-4 py-2" style={{ color: "var(--color-text)" }}>
                    {def.description}
                  </td>

                  {/* Keybinding */}
                  <td className="px-4 py-2">
                    {isRecording ? (
                      <div
                        ref={recordInputRef}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono"
                        style={{
                          backgroundColor: "var(--color-surface-1)",
                          border: "1px solid var(--color-blue)",
                          color: pendingBinding ? "var(--color-text)" : "var(--color-overlay-1)",
                          minWidth: "100px",
                        }}
                      >
                        {recording.preview}
                      </div>
                    ) : (
                      <kbd
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono"
                        style={{
                          backgroundColor: "var(--color-surface-0)",
                          color: isCustom ? "var(--color-blue)" : "var(--color-subtext-0)",
                          border: "1px solid var(--color-surface-1)",
                          fontSize: "11px",
                        }}
                      >
                        {formatShortcut(def)}
                      </kbd>
                    )}
                  </td>

                  {/* Source */}
                  <td className="px-4 py-2">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: isCustom
                          ? "color-mix(in srgb, var(--color-blue) 15%, transparent)"
                          : "var(--color-surface-0)",
                        color: isCustom ? "var(--color-blue)" : "var(--color-overlay-1)",
                      }}
                    >
                      {isCustom ? "Custom" : "Built-in"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isRecording ? (
                        <>
                          <button
                            type="button"
                            onClick={confirmRecording}
                            disabled={!pendingBinding}
                            className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-30"
                            style={{ color: "var(--color-green)" }}
                            title="Confirm"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelRecording}
                            className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
                            style={{ color: "var(--color-red)" }}
                            title="Cancel"
                          >
                            <X size={12} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startRecording(def.id)}
                            className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
                            style={{ color: "var(--color-overlay-1)" }}
                            title="Edit keybinding"
                          >
                            <Pencil size={12} />
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => removeKeybindingOverride(def.id)}
                              className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
                              style={{ color: "var(--color-overlay-1)" }}
                              title="Reset to default"
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  No keybindings match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
