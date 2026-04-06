import { useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor";
import { normalizeFilePath, fileName, openFileInEditor } from "./helpers";

// Lazy-load the Monaco DiffEditor only when needed for inline previews
const DiffEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.DiffEditor }))
);

// ─── Animation variants ─────────────────────────────────────────────────────

const expandVariants = {
  collapsed: { height: 0, opacity: 0, overflow: "hidden" as const },
  expanded: { height: "auto", opacity: 1, overflow: "hidden" as const },
};

const expandTransition = {
  height: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  opacity: { duration: 0.15, delay: 0.05 },
};

// ─── InlineDiffPreview ──────────────────────────────────────────────────────

export interface InlineDiffPreviewProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  language: string;
}

export function InlineDiffPreview({ filePath, oldContent, newContent, language }: InlineDiffPreviewProps) {
  const [collapsed, setCollapsed] = useState(true);
  const normalizedPath = normalizeFilePath(filePath);
  const pendingDiff = useEditorStore((s) => s.pendingDiffs.get(normalizedPath));
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);

  const oldLines = oldContent.split("\n").length;
  const newLines = newContent.split("\n").length;
  const added = Math.max(0, newLines - oldLines);
  const removed = Math.max(0, oldLines - newLines);

  return (
    <div
      className="rounded-md overflow-hidden mt-1 mb-1"
      style={{
        border: "1px solid var(--color-surface-1)",
        backgroundColor: "var(--color-mantle)",
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs cursor-pointer hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-text)", background: "none", border: "none" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? (
          <ChevronRight size={11} style={{ color: "var(--color-overlay-1)" }} />
        ) : (
          <ChevronDown size={11} style={{ color: "var(--color-overlay-1)" }} />
        )}
        <FileText size={12} style={{ color: "var(--color-yellow)" }} />
        <span className="font-mono truncate" style={{ color: "var(--color-blue)" }}>
          {fileName(filePath)}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-green)" }}>
          +{added}
        </span>
        <span className="text-[10px]" style={{ color: "var(--color-red)" }}>
          -{removed}
        </span>
        <span className="flex-1" />
        {pendingDiff && (
          <span className="text-[10px] px-1 rounded" style={{
            backgroundColor: "var(--color-yellow)",
            color: "var(--color-crust)",
          }}>
            pending review
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={expandVariants}
            transition={expandTransition}
            style={{ borderTop: "1px solid var(--color-surface-1)" }}
          >
            <div className="flex items-center gap-2 px-3 py-1" style={{
              backgroundColor: "var(--color-surface-0)",
            }}>
              {pendingDiff && (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "var(--color-green)", color: "var(--color-crust)" }}
                    onClick={(e) => { e.stopPropagation(); acceptDiff(normalizedPath); }}
                  >
                    <Check size={10} /> Accept
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "var(--color-red)", color: "var(--color-crust)" }}
                    onClick={(e) => { e.stopPropagation(); rejectDiff(normalizedPath); }}
                  >
                    <X size={10} /> Reject
                  </button>
                </>
              )}
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ml-auto transition-colors hover:bg-[var(--color-surface-1)]"
                style={{ color: "var(--color-blue)" }}
                onClick={(e) => { e.stopPropagation(); openFileInEditor(filePath); }}
              >
                <ExternalLink size={10} /> Open in Editor
              </button>
            </div>
            <div style={{ height: 250 }}>
              <Suspense fallback={
                <div className="flex items-center justify-center h-full text-xs" style={{ color: "var(--color-overlay-1)" }}>
                  Loading diff viewer...
                </div>
              }>
                <DiffEditor
                  original={oldContent}
                  modified={newContent}
                  language={language}
                  theme="catppuccin-mocha"
                  options={{
                    readOnly: true,
                    renderSideBySide: false,
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    minimap: { enabled: false },
                    renderOverviewRuler: false,
                    fontSize: 11,
                    lineNumbers: "on",
                    padding: { top: 4 },
                  }}
                />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
