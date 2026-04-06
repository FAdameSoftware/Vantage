import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  CircleAlert,
} from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import { getToolMeta } from "./toolMeta";

// ─── Animation variants ─────────────────────────────────────────────────────

const expandVariants = {
  collapsed: { height: 0, opacity: 0, overflow: "hidden" as const },
  expanded: { height: "auto", opacity: 1, overflow: "hidden" as const },
};

const expandTransition = {
  height: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  opacity: { duration: 0.15, delay: 0.05 },
};

// ─── WidgetShell ────────────────────────────────────────────────────────────

interface WidgetShellProps {
  toolCall: ToolCall;
  /** If provided, overrides internal expanded state (controlled mode) */
  forceExpanded?: boolean;
  /** Compact header rendered inline after the chevron */
  compactHeader: React.ReactNode;
  /** Expanded content rendered below the header */
  children: React.ReactNode;
}

export function WidgetShell({ toolCall, forceExpanded, compactHeader, children }: WidgetShellProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpanded = forceExpanded !== undefined ? forceExpanded : expanded;
  const meta = getToolMeta(toolCall.name);
  const borderColor = meta.color;

  return (
    <div
      className="rounded-lg overflow-hidden my-2 text-xs"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-0)",
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
    >
      {/* Header -- compact, one-line, clickable to toggle */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left bg-transparent border-none cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {isExpanded ? (
          <ChevronDown size={12} style={{ color: "var(--color-overlay-1)" }} />
        ) : (
          <ChevronRight size={12} style={{ color: "var(--color-overlay-1)" }} />
        )}

        {/* Tool-specific compact header */}
        {compactHeader}

        {/* Status indicators */}
        {toolCall.isExecuting && (
          <span className="flex items-center gap-1 flex-shrink-0" style={{ color: "var(--color-blue)" }}>
            <Loader2 size={12} className="animate-spin" />
            <span className="text-[10px]">running</span>
          </span>
        )}
        {toolCall.isError && !toolCall.isExecuting && (
          <span className="flex items-center gap-1 flex-shrink-0" style={{ color: "var(--color-red)" }}>
            <CircleAlert size={12} />
            <span className="text-[10px]">error</span>
          </span>
        )}
      </button>

      {/* Expanded content with smooth animation */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={expandVariants}
            transition={expandTransition}
          >
            <div
              className="px-3 py-2"
              style={{ borderTop: "1px solid var(--color-surface-1)" }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
