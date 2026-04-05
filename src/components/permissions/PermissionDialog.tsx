import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, ShieldCheck, ShieldX, Shield } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import { useClaude } from "@/hooks/useClaude";

// ─── Risk level classification ───────────────────────────────────────────────

type RiskLevel = "safe" | "write" | "destructive" | "unknown";

const DESTRUCTIVE_BASH_PATTERNS = [
  /rm\s+-rf/i,
  /git\s+push\s+--force/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-f/i,
  /drop\s+table/i,
  /format\s+[a-z]:/i,
];

function getRiskLevel(toolName: string, toolInput: Record<string, unknown>): RiskLevel {
  const name = toolName.toLowerCase();

  // Safe tools
  if (["read", "glob", "grep", "websearch", "webfetch", "ls"].includes(name)) {
    return "safe";
  }

  // Bash: check command for destructive patterns
  if (name === "bash") {
    const command = String(toolInput.command ?? "");
    for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
      if (pattern.test(command)) return "destructive";
    }
    return "write";
  }

  // Write-level tools
  if (["edit", "write", "notebookedit", "agent"].includes(name)) {
    return "write";
  }

  return "unknown";
}

// ─── Risk-level styling ───────────────────────────────────────────────────────

const RISK_CONFIG: Record<
  RiskLevel,
  { color: string; barColor: string; label: string; Icon: typeof Shield }
> = {
  safe: {
    color: "var(--color-green)",
    barColor: "var(--color-green)",
    label: "Safe",
    Icon: ShieldCheck,
  },
  write: {
    color: "var(--color-yellow)",
    barColor: "var(--color-yellow)",
    label: "Write",
    Icon: ShieldAlert,
  },
  destructive: {
    color: "var(--color-red)",
    barColor: "var(--color-red)",
    label: "Destructive",
    Icon: ShieldX,
  },
  unknown: {
    color: "var(--color-blue)",
    barColor: "var(--color-blue)",
    label: "Unknown",
    Icon: Shield,
  },
};

// ─── Tool-specific input rendering ───────────────────────────────────────────

function BashPreview({ command }: { command: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-xs uppercase tracking-wider font-semibold"
        style={{ color: "var(--color-overlay-1)" }}
      >
        Command
      </span>
      <pre
        className="text-xs rounded p-2 whitespace-pre-wrap break-all overflow-auto max-h-40"
        style={{
          fontFamily: "var(--font-mono)",
          backgroundColor: "var(--color-crust)",
          color: "var(--color-text)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {command}
      </pre>
    </div>
  );
}

function EditPreview({
  oldString,
  newString,
  filePath,
}: {
  oldString: string;
  newString: string;
  filePath?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {filePath && (
        <div className="flex flex-col gap-1">
          <span
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: "var(--color-overlay-1)" }}
          >
            File
          </span>
          <code
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-crust)",
              color: "var(--color-subtext-1)",
            }}
          >
            {filePath}
          </code>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "var(--color-overlay-1)" }}
        >
          Changes
        </span>
        <div
          className="rounded overflow-hidden text-xs"
          style={{
            fontFamily: "var(--font-mono)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          {oldString && (
            <pre
              className="px-3 py-1.5 whitespace-pre-wrap break-all m-0 max-h-24 overflow-auto"
              style={{
                backgroundColor: "rgba(243, 139, 168, 0.12)",
                color: "var(--color-red)",
                borderBottom: newString ? "1px solid var(--color-surface-0)" : undefined,
              }}
            >
              {"- " + oldString.split("\n").join("\n- ")}
            </pre>
          )}
          {newString && (
            <pre
              className="px-3 py-1.5 whitespace-pre-wrap break-all m-0 max-h-24 overflow-auto"
              style={{
                backgroundColor: "rgba(166, 227, 161, 0.12)",
                color: "var(--color-green)",
              }}
            >
              {"+ " + newString.split("\n").join("\n+ ")}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function WritePreview({ filePath, content }: { filePath?: string; content?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {filePath && (
        <div className="flex flex-col gap-1">
          <span
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: "var(--color-overlay-1)" }}
          >
            File
          </span>
          <code
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-crust)",
              color: "var(--color-subtext-1)",
            }}
          >
            {filePath}
          </code>
        </div>
      )}
      {content && (
        <div className="flex flex-col gap-1">
          <span
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: "var(--color-overlay-1)" }}
          >
            Content
          </span>
          <pre
            className="text-xs rounded p-2 whitespace-pre-wrap break-all overflow-auto max-h-40"
            style={{
              fontFamily: "var(--font-mono)",
              backgroundColor: "var(--color-crust)",
              color: "var(--color-text)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function ReadPreview({ filePath }: { filePath?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-xs uppercase tracking-wider font-semibold"
        style={{ color: "var(--color-overlay-1)" }}
      >
        Path
      </span>
      <code
        className="text-xs px-1.5 py-0.5 rounded"
        style={{
          fontFamily: "var(--font-mono)",
          backgroundColor: "var(--color-crust)",
          color: "var(--color-subtext-1)",
        }}
      >
        {filePath ?? "(unknown)"}
      </code>
    </div>
  );
}

function DefaultPreview({ toolInput }: { toolInput: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-xs uppercase tracking-wider font-semibold"
        style={{ color: "var(--color-overlay-1)" }}
      >
        Input
      </span>
      <pre
        className="text-xs rounded p-2 whitespace-pre-wrap break-all overflow-auto max-h-40"
        style={{
          fontFamily: "var(--font-mono)",
          backgroundColor: "var(--color-crust)",
          color: "var(--color-text)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {JSON.stringify(toolInput, null, 2)}
      </pre>
    </div>
  );
}

function ToolInputPreview({
  toolName,
  toolInput,
}: {
  toolName: string;
  toolInput: Record<string, unknown>;
}) {
  const name = toolName.toLowerCase();

  if (name === "bash") {
    return <BashPreview command={String(toolInput.command ?? "")} />;
  }

  if (name === "edit") {
    return (
      <EditPreview
        filePath={String(toolInput.file_path ?? toolInput.path ?? "")}
        oldString={String(toolInput.old_string ?? "")}
        newString={String(toolInput.new_string ?? "")}
      />
    );
  }

  if (name === "write") {
    return (
      <WritePreview
        filePath={String(toolInput.file_path ?? toolInput.path ?? "")}
        content={String(toolInput.content ?? "")}
      />
    );
  }

  if (name === "read") {
    return <ReadPreview filePath={String(toolInput.file_path ?? toolInput.path ?? "")} />;
  }

  return <DefaultPreview toolInput={toolInput} />;
}

// ─── Keyboard shortcut badge ─────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center rounded px-1 text-xs font-bold"
      style={{
        fontFamily: "var(--font-mono)",
        backgroundColor: "var(--color-surface-0)",
        color: "var(--color-overlay-2)",
        border: "1px solid var(--color-surface-1)",
        minWidth: "1.25rem",
        lineHeight: "1.4",
      }}
    >
      {children}
    </kbd>
  );
}

// ─── Permission Dialog ────────────────────────────────────────────────────────

export function PermissionDialog() {
  const pendingPermission = useConversationStore((s) => s.pendingPermission);
  const allowToolForSession = useConversationStore((s) => s.allowToolForSession);
  const isToolAllowedForSession = useConversationStore((s) => s.isToolAllowedForSession);
  const { respondPermission } = useClaude();

  // Auto-approve tools that have been allowed for the session
  useEffect(() => {
    if (!pendingPermission) return;
    if (isToolAllowedForSession(pendingPermission.toolName)) {
      void respondPermission(true);
    }
  }, [pendingPermission, isToolAllowedForSession, respondPermission]);

  const handleAllow = useCallback(() => {
    void respondPermission(true);
  }, [respondPermission]);

  const handleDeny = useCallback(() => {
    void respondPermission(false);
  }, [respondPermission]);

  const handleAllowSession = useCallback(() => {
    if (pendingPermission) {
      allowToolForSession(pendingPermission.toolName);
    }
    void respondPermission(true);
  }, [respondPermission, pendingPermission, allowToolForSession]);

  // Keyboard shortcuts (capture phase so they fire before anything else)
  useEffect(() => {
    if (!pendingPermission) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      // Don't intercept if user is typing in an input
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "y" || e.key === "Y" || e.key === "Enter") {
        e.preventDefault();
        handleAllow();
      } else if (e.key === "n" || e.key === "N" || e.key === "Escape") {
        e.preventDefault();
        handleDeny();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleAllowSession();
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [pendingPermission, handleAllow, handleDeny, handleAllowSession]);

  const showDialog = !!pendingPermission && !isToolAllowedForSession(pendingPermission?.toolName ?? "");

  const toolName = pendingPermission?.toolName ?? "";
  const toolInput = pendingPermission?.toolInput ?? {};
  const risk = getRiskLevel(toolName, toolInput);
  const { color, barColor, label, Icon } = RISK_CONFIG[risk];

  return (
    <AnimatePresence>
      {showDialog && (
    // Fixed overlay backdrop
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Dialog panel */}
      <motion.div
        className="relative w-full max-w-lg mx-4 rounded-xl overflow-hidden flex flex-col"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        style={{
          backgroundColor: "var(--color-mantle)",
          border: "1px solid var(--color-surface-0)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Risk color bar at top */}
        <div
          className="h-[3px] w-full shrink-0"
          style={{ backgroundColor: barColor }}
        />

        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--color-surface-0)" }}
        >
          {/* Tool icon */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          >
            <Icon size={16} style={{ color }} />
          </div>

          {/* Tool name + risk label */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <code
                className="text-sm font-semibold"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text)",
                }}
              >
                {toolName}
              </code>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon size={11} style={{ color }} />
              <span
                className="text-xs font-medium"
                style={{ color }}
              >
                {label}
              </span>
              <span
                className="text-xs"
                style={{ color: "var(--color-overlay-1)" }}
              >
                permission required
              </span>
            </div>
          </div>
        </div>

        {/* Input preview */}
        <div className="px-5 py-4 overflow-auto max-h-64">
          <ToolInputPreview toolName={toolName} toolInput={toolInput} />
        </div>

        {/* Action buttons */}
        <div
          className="flex items-center gap-2 px-5 py-4 shrink-0"
          style={{ borderTop: "1px solid var(--color-surface-0)" }}
        >
          {/* Allow */}
          <button
            type="button"
            onClick={handleAllow}
            className="flex items-center gap-2 flex-1 justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              backgroundColor: "rgba(166, 227, 161, 0.15)",
              color: "var(--color-green)",
              border: "1px solid rgba(166, 227, 161, 0.3)",
            }}
          >
            Allow
            <Kbd>Y</Kbd>
          </button>

          {/* Allow for Session */}
          <button
            type="button"
            onClick={handleAllowSession}
            className="flex items-center gap-2 flex-1 justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-subtext-1)",
              border: "1px solid var(--color-surface-1)",
            }}
          >
            Allow for Session
            <Kbd>S</Kbd>
          </button>

          {/* Deny */}
          <button
            type="button"
            onClick={handleDeny}
            className="flex items-center gap-2 flex-1 justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              backgroundColor: "rgba(243, 139, 168, 0.15)",
              color: "var(--color-red)",
              border: "1px solid rgba(243, 139, 168, 0.3)",
            }}
          >
            Deny
            <Kbd>N</Kbd>
          </button>
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
