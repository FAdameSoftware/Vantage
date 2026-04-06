import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import { normalizeModelName } from "@/lib/pricing";
import type { ConversationState } from "@/stores/conversation";

// Fine-grained selectors
const selectSession = (s: ConversationState) => s.session;
const selectConnectionStatus = (s: ConversationState) => s.connectionStatus;
const selectTotalCost = (s: ConversationState) => s.totalCost;

export function SessionInfoBadge() {
  const session = useConversationStore(selectSession);
  const totalCost = useConversationStore(selectTotalCost);
  const connectionStatus = useConversationStore(selectConnectionStatus);
  const [elapsed, setElapsed] = useState("");
  const [expanded, setExpanded] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());

  // Reset start time when session changes
  useEffect(() => {
    if (session) {
      sessionStartRef.current = Date.now();
    }
  }, [session?.sessionId]);

  // Update elapsed timer every second
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const diffMs = Date.now() - sessionStartRef.current;
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      if (mins > 0) {
        setElapsed(`${mins}m ${secs}s`);
      } else {
        setElapsed(`${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.sessionId]);

  const isConnected = connectionStatus === "ready" || connectionStatus === "streaming";
  if (!session || !isConnected) return null;

  const truncatedId = session.sessionId
    ? session.sessionId.slice(0, 8) + "..."
    : "unknown";
  const modelName = session.model ? normalizeModelName(session.model) : "unknown";

  return (
    <div
      className="shrink-0 px-3 py-1"
      style={{
        backgroundColor: "var(--color-surface-0)",
        borderBottom: "1px solid var(--color-surface-1)",
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded((e) => !e)}
        aria-label="Toggle session details"
      >
        <Info size={11} style={{ color: "var(--color-blue)" }} />
        <span
          className="text-[10px] font-mono"
          style={{ color: "var(--color-subtext-0)" }}
          title={`Session: ${session.sessionId}`}
        >
          {truncatedId}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-overlay-0)" }}>
          {elapsed}
        </span>
        {totalCost > 0 && (
          <span className="text-[10px]" style={{ color: "var(--color-green)" }}>
            ${totalCost.toFixed(4)}
          </span>
        )}
        <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
          {modelName}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
        <motion.div
          className="mt-1 pt-1 text-[10px] space-y-0.5"
          style={{
            borderTop: "1px solid var(--color-surface-1)",
            color: "var(--color-overlay-1)",
          }}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        >
          <div>
            <span style={{ color: "var(--color-overlay-0)" }}>Session ID: </span>
            <span className="font-mono">{session.sessionId}</span>
          </div>
          {session.cwd && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>CWD: </span>
              <span className="font-mono">{session.cwd}</span>
            </div>
          )}
          {session.claudeCodeVersion && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>CLI: </span>
              <span>v{session.claudeCodeVersion}</span>
            </div>
          )}
          {session.permissionMode && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>Permissions: </span>
              <span>{session.permissionMode}</span>
            </div>
          )}
          {session.tools && session.tools.length > 0 && (
            <div>
              <span style={{ color: "var(--color-overlay-0)" }}>Tools: </span>
              <span>{session.tools.length} available</span>
            </div>
          )}
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
