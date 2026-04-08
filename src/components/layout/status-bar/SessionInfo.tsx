import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Coins, Clock, Hash, Loader2 } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import { useLayoutStore } from "@/stores/layout";
import { useUsageStore } from "@/stores/usage";
import { UsagePanel } from "@/components/shared/UsagePanel";
import { EffortLevelSelector } from "@/components/shared/EffortLevelSelector";
import { normalizeModelName } from "@/lib/pricing";
import { AVAILABLE_MODELS } from "@/lib/models";
import { popupMotion } from "./shared";

// ── Model descriptions (keyed by family) ────────────────────────────────

const MODEL_DESCRIPTIONS: Record<string, string> = {
  opus: "Most capable",
  sonnet: "Fast & smart",
  haiku: "Fastest",
};

function ModelSelectorDropdown({
  currentModel,
  onClose,
}: {
  currentModel: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="absolute bottom-7 right-0 z-50 rounded shadow-lg py-1 min-w-[180px]"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      role="listbox"
      aria-label="Model selector"
      {...popupMotion}
    >
      {AVAILABLE_MODELS.map((model) => (
        <button
          key={model.id}
          type="button"
          role="option"
          aria-selected={currentModel === model.id}
          className="flex flex-col w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--color-surface-1)] transition-colors"
          onClick={() => {
            // Model selection is informational — the actual model is set by the CLI session
            onClose();
          }}
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                color:
                  currentModel === model.id
                    ? "var(--color-blue)"
                    : "var(--color-text)",
              }}
              className="font-medium"
            >
              {model.label}
            </span>
            {currentModel === model.id && (
              <span
                className="ml-auto text-[10px]"
                style={{ color: "var(--color-blue)" }}
              >
                Active
              </span>
            )}
          </div>
          <span
            className="text-[10px] mt-0.5"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {MODEL_DESCRIPTIONS[model.family] ?? ""}
          </span>
        </button>
      ))}
    </motion.div>
  );
}

// ── SessionInfo Component ──────────────────────────────────────────────────

export interface SessionInfoProps {
  windowWidth: number;
}

export function SessionInfo({ windowWidth }: SessionInfoProps) {
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const session = useConversationStore((s) => s.session);
  const totalCost = useConversationStore((s) => s.totalCost);

  const toggleSecondarySidebar = useLayoutStore((s) => s.toggleSecondarySidebar);

  const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
  const usageTotalCost = useUsageStore((s) => s.totalCostUsd);
  const usageInputTokens = useUsageStore((s) => s.inputTokens);
  const usageOutputTokens = useUsageStore((s) => s.outputTokens);
  const allTimeCost = useUsageStore((s) => s.allTimeCost);
  const projectUsageLoaded = useUsageStore((s) => s.projectUsageLoaded);
  const lastSessionModel = useUsageStore((s) => s.lastSessionModel);

  const [elapsed, setElapsed] = useState("");
  const [showUsage, setShowUsage] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const modelSelectorRef = useRef<HTMLDivElement>(null);

  // Session elapsed timer
  useEffect(() => {
    if (!sessionStartedAt) {
      setElapsed("");
      return;
    }
    const update = () => {
      const ms = Date.now() - sessionStartedAt;
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) setElapsed(`${h}h ${m % 60}m`);
      else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
      else setElapsed(`${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  // Close model selector on outside click
  useEffect(() => {
    if (!showModelSelector) return;
    function handleClick(e: MouseEvent) {
      if (
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(e.target as Node)
      ) {
        setShowModelSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelSelector]);

  const connectionStatus = isStreaming
    ? "Streaming"
    : session
      ? "Connected"
      : projectUsageLoaded && allTimeCost > 0
        ? "History"
        : "Ready";
  const statusColor = isStreaming
    ? "var(--color-peach)"
    : session
      ? "var(--color-green)"
      : projectUsageLoaded && allTimeCost > 0
        ? "var(--color-blue)"
        : "var(--color-overlay-1)";

  return (
    <>
      {/* Usage panel popup */}
      <AnimatePresence>
        {showUsage && (
          <motion.div
            className="absolute bottom-7 right-2 z-50"
            {...popupMotion}
          >
            <UsagePanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Divider */}
      <div className="w-px h-2.5" style={{ backgroundColor: "var(--color-surface-1)" }} />

      {/* Claude session status -> click opens chat panel */}
      <button
        className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors shrink-0"
        onClick={() => toggleSecondarySidebar()}
        title="Toggle Chat Panel"
      >
        {isStreaming ? (
          <Loader2 size={12} className="animate-spin" style={{ color: statusColor }} />
        ) : (
          <Zap size={12} style={{ color: statusColor }} />
        )}
        <span>{connectionStatus}</span>
      </button>

      {/* Usage: session timer, tokens, cost — hidden below 1000px */}
      {windowWidth >= 1000 && (
        <button
          className="flex items-center gap-3 hover:text-[var(--color-text)] transition-colors shrink-0"
          onClick={() => setShowUsage((s) => !s)}
          title="Toggle Usage Panel"
        >
          {/* Session timer */}
          {elapsed && (
            <div className="flex items-center gap-1" title="Session duration">
              <Clock size={11} />
              <span>{elapsed}</span>
            </div>
          )}

          {/* Token count */}
          {(usageInputTokens > 0 || usageOutputTokens > 0) && (
            <div
              className="flex items-center gap-1"
              title={`Input: ${usageInputTokens.toLocaleString()} | Output: ${usageOutputTokens.toLocaleString()}`}
            >
              <Hash size={11} />
              <span>
                {((usageInputTokens + usageOutputTokens) / 1000).toFixed(1)}k
              </span>
            </div>
          )}

          {/* Cost: session cost | all-time cost */}
          <div className="flex items-center gap-1" title={allTimeCost > 0 ? `Session: $${(usageTotalCost || totalCost).toFixed(4)} | Project total: $${allTimeCost.toFixed(4)}` : "Session cost"}>
            <Coins size={11} />
            <span>${(usageTotalCost || totalCost).toFixed(4)}</span>
            {allTimeCost > 0 && allTimeCost !== usageTotalCost && (
              <span style={{ color: "var(--color-overlay-1)", fontSize: "10px" }}>
                / ${allTimeCost.toFixed(2)}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Effort level — hidden below 800px */}
      {windowWidth >= 800 && <EffortLevelSelector />}

      {/* Model -> click opens model selector dropdown */}
      <div ref={modelSelectorRef} className="relative shrink-0">
        <button
          className="hover:text-[var(--color-text)] transition-colors truncate max-w-[140px] text-[10px]"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={() => setShowModelSelector((v) => !v)}
          title="Select Model"
        >
          {normalizeModelName(session?.model ?? lastSessionModel ?? "claude-opus-4-6").replace("claude-", "")}
        </button>
        <AnimatePresence>
          {showModelSelector && (
            <ModelSelectorDropdown
              currentModel={session?.model ?? lastSessionModel ?? "claude-opus-4-6"}
              onClose={() => setShowModelSelector(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
