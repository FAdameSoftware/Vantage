import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Save, Edit2, X, Zap } from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────

/** A single hook entry: matcher pattern + shell command */
interface HookEntry {
  matcher: string;
  command: string;
}

/** The hook event types supported by Claude Code */
const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStop",
] as const;
type HookEvent = (typeof HOOK_EVENTS)[number];

/** Shape of the hooks object inside settings.json */
type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>;

// ── Helpers ───────────────────────────────────────────────────────────

function parseHooksFromSettings(settingsJson: string): HooksConfig {
  try {
    const parsed = JSON.parse(settingsJson);
    const hooks = parsed?.hooks;
    if (!hooks || typeof hooks !== "object") return {};

    const result: HooksConfig = {};
    for (const event of HOOK_EVENTS) {
      if (Array.isArray(hooks[event])) {
        result[event] = hooks[event].map((h: Record<string, unknown>) => ({
          matcher: String(h.matcher ?? ""),
          command: String(h.command ?? ""),
        }));
      }
    }
    return result;
  } catch {
    return {};
  }
}

function mergeHooksIntoSettings(
  settingsJson: string,
  hooks: HooksConfig
): string {
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(settingsJson);
  } catch {
    settings = {};
  }

  // Build clean hooks object — omit events with empty arrays
  const cleanHooks: Record<string, HookEntry[]> = {};
  for (const event of HOOK_EVENTS) {
    const entries = hooks[event];
    if (entries && entries.length > 0) {
      cleanHooks[event] = entries;
    }
  }

  if (Object.keys(cleanHooks).length > 0) {
    settings.hooks = cleanHooks;
  } else {
    delete settings.hooks;
  }

  return JSON.stringify(settings, null, 2);
}

// ── Hook Form (Add / Edit) ────────────────────────────────────────────

function HookForm({
  initialEvent,
  initialMatcher,
  initialCommand,
  onSave,
  onCancel,
  saveLabel,
}: {
  initialEvent: HookEvent;
  initialMatcher: string;
  initialCommand: string;
  onSave: (event: HookEvent, matcher: string, command: string) => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const [event, setEvent] = useState<HookEvent>(initialEvent);
  const [matcher, setMatcher] = useState(initialMatcher);
  const [command, setCommand] = useState(initialCommand);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    onSave(event, matcher.trim(), command.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3 rounded-lg"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {/* Event type */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--color-subtext-0)" }}
        >
          Event
        </label>
        <select
          value={event}
          onChange={(e) => setEvent(e.target.value as HookEvent)}
          className="h-7 px-2 rounded text-xs"
          style={{
            backgroundColor: "var(--color-base)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          {HOOK_EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
      </div>

      {/* Matcher */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--color-subtext-0)" }}
        >
          Matcher (tool name or glob, blank = match all)
        </label>
        <input
          type="text"
          value={matcher}
          onChange={(e) => setMatcher(e.target.value)}
          placeholder="e.g. Bash, Write, *.ts"
          className="h-7 px-2 rounded text-xs"
          style={{
            backgroundColor: "var(--color-base)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          }}
        />
      </div>

      {/* Command */}
      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium"
          style={{ color: "var(--color-subtext-0)" }}
        >
          Command
        </label>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder='e.g. npx prettier --write "$FILE_PATH"'
          className="h-7 px-2 rounded text-xs font-mono"
          style={{
            backgroundColor: "var(--color-base)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-1">
        <button
          type="submit"
          className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium"
          style={{
            backgroundColor: "var(--color-blue)",
            color: "var(--color-crust)",
          }}
        >
          <Save size={12} />
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 h-7 rounded text-xs"
          style={{
            backgroundColor: "var(--color-surface-1)",
            color: "var(--color-text)",
          }}
        >
          <X size={12} />
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Single Hook Row ───────────────────────────────────────────────────

function HookRow({
  event,
  hook,
  onEdit,
  onDelete,
}: {
  event: HookEvent;
  hook: HookEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded"
      style={{
        backgroundColor: "var(--color-mantle)",
        border: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Event badge */}
      <span
        className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
        style={{
          backgroundColor: "var(--color-surface-1)",
          color: "var(--color-blue)",
        }}
      >
        {event}
      </span>

      {/* Matcher */}
      {hook.matcher && (
        <span
          className="shrink-0 px-1.5 py-0.5 rounded text-xs font-mono"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-yellow)",
          }}
        >
          {hook.matcher}
        </span>
      )}

      {/* Command */}
      <span
        className="flex-1 text-xs font-mono truncate"
        style={{ color: "var(--color-text)" }}
        title={hook.command}
      >
        {hook.command}
      </span>

      {/* Actions */}
      <button
        onClick={onEdit}
        className="shrink-0 p-1 rounded hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-overlay-1)" }}
        title="Edit hook"
      >
        <Edit2 size={12} />
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 p-1 rounded hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-red)" }}
        title="Delete hook"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function HooksEditor() {
  const [hooks, setHooks] = useState<HooksConfig>({});
  const [rawSettings, setRawSettings] = useState("{}");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingKey, setEditingKey] = useState<{
    event: HookEvent;
    index: number;
  } | null>(null);

  // ── Load hooks ──
  const loadHooks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const settingsJson = await invoke<string>("read_claude_settings");
      setRawSettings(settingsJson);
      setHooks(parseHooksFromSettings(settingsJson));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHooks();
  }, [loadHooks]);

  // ── Save hooks ──
  const saveHooks = useCallback(
    async (updatedHooks: HooksConfig) => {
      try {
        const merged = mergeHooksIntoSettings(rawSettings, updatedHooks);
        await invoke("write_claude_settings", { content: merged });
        setRawSettings(merged);
        setHooks(updatedHooks);
        toast.success("Hooks saved");
      } catch (e) {
        toast.error(`Failed to save hooks: ${e}`);
      }
    },
    [rawSettings]
  );

  // ── Add hook ──
  const handleAdd = useCallback(
    (event: HookEvent, matcher: string, command: string) => {
      const updated = { ...hooks };
      if (!updated[event]) {
        updated[event] = [];
      }
      updated[event] = [...updated[event]!, { matcher, command }];
      saveHooks(updated);
      setShowAddForm(false);
    },
    [hooks, saveHooks]
  );

  // ── Edit hook ──
  const handleEdit = useCallback(
    (
      origEvent: HookEvent,
      origIndex: number,
      newEvent: HookEvent,
      matcher: string,
      command: string
    ) => {
      const updated = { ...hooks };

      // Remove from original location
      const origList = [...(updated[origEvent] ?? [])];
      origList.splice(origIndex, 1);
      updated[origEvent] = origList;

      // Add to new location
      if (!updated[newEvent]) {
        updated[newEvent] = [];
      }
      updated[newEvent] = [...updated[newEvent]!, { matcher, command }];

      saveHooks(updated);
      setEditingKey(null);
    },
    [hooks, saveHooks]
  );

  // ── Delete hook ──
  const handleDelete = useCallback(
    (event: HookEvent, index: number) => {
      const updated = { ...hooks };
      const list = [...(updated[event] ?? [])];
      list.splice(index, 1);
      updated[event] = list;
      saveHooks(updated);
    },
    [hooks, saveHooks]
  );

  // ── Count total hooks ──
  const totalHooks = HOOK_EVENTS.reduce(
    (sum, ev) => sum + (hooks[ev]?.length ?? 0),
    0
  );

  // ── Render ──
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <span className="text-sm">Loading hooks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div
          className="p-3 rounded text-sm"
          style={{
            backgroundColor: "var(--color-red)",
            color: "var(--color-crust)",
          }}
        >
          Failed to load hooks: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: "var(--color-yellow)" }} />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--color-text)" }}
          >
            Claude Code Hooks
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: "var(--color-surface-1)",
              color: "var(--color-subtext-0)",
            }}
          >
            {totalHooks} hook{totalHooks !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingKey(null);
          }}
          className="flex items-center gap-1.5 px-3 h-7 rounded text-xs font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: "var(--color-blue)",
            color: "var(--color-crust)",
          }}
        >
          <Plus size={12} />
          Add Hook
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3 max-w-2xl">
          {/* Add form */}
          {showAddForm && (
            <HookForm
              initialEvent="PreToolUse"
              initialMatcher=""
              initialCommand=""
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              saveLabel="Add Hook"
            />
          )}

          {/* Hooks list grouped by event */}
          {totalHooks === 0 && !showAddForm && (
            <div
              className="text-center py-8"
              style={{ color: "var(--color-overlay-1)" }}
            >
              <Zap
                size={32}
                className="mx-auto mb-3"
                style={{ color: "var(--color-surface-1)" }}
              />
              <p className="text-sm mb-1">No hooks configured</p>
              <p className="text-xs">
                Hooks run shell commands when Claude uses tools, sends
                notifications, or stops.
              </p>
            </div>
          )}

          {HOOK_EVENTS.map((event) => {
            const entries = hooks[event];
            if (!entries || entries.length === 0) return null;

            return (
              <div key={event} className="flex flex-col gap-1.5">
                {entries.map((hook, index) => {
                  const isEditing =
                    editingKey?.event === event && editingKey?.index === index;

                  if (isEditing) {
                    return (
                      <HookForm
                        key={`${event}-${index}-edit`}
                        initialEvent={event}
                        initialMatcher={hook.matcher}
                        initialCommand={hook.command}
                        onSave={(newEvent, matcher, command) =>
                          handleEdit(event, index, newEvent, matcher, command)
                        }
                        onCancel={() => setEditingKey(null)}
                        saveLabel="Save"
                      />
                    );
                  }

                  return (
                    <HookRow
                      key={`${event}-${index}`}
                      event={event}
                      hook={hook}
                      onEdit={() => setEditingKey({ event, index })}
                      onDelete={() => handleDelete(event, index)}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Description */}
          <div
            className="mt-4 p-3 rounded text-xs leading-relaxed"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-0)",
            }}
          >
            <strong>Hook Events:</strong>
            <ul className="mt-1 ml-3 list-disc space-y-0.5">
              <li>
                <strong>PreToolUse</strong> -- Runs before Claude executes a tool
                (e.g., auto-approve patterns)
              </li>
              <li>
                <strong>PostToolUse</strong> -- Runs after a tool completes
                (e.g., lint after edit)
              </li>
              <li>
                <strong>Notification</strong> -- Runs when Claude sends a
                notification
              </li>
              <li>
                <strong>Stop</strong> -- Runs when a Claude session stops
              </li>
              <li>
                <strong>SubagentStop</strong> -- Runs when a subagent stops
              </li>
            </ul>
            <p className="mt-2">
              Changes are saved to{" "}
              <code
                className="px-1 py-0.5 rounded font-mono"
                style={{ backgroundColor: "var(--color-mantle)" }}
              >
                ~/.claude/settings.json
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
