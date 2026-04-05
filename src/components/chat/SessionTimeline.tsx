import { useRef } from "react";
import { Clock, Plus } from "lucide-react";
import { useConversationStore } from "@/stores/conversation";
import { CheckpointDot } from "./CheckpointDot";

/**
 * SessionTimeline — a horizontal strip above the chat messages showing
 * conversation checkpoints as clickable dots on a line. Clicking a dot
 * restores the conversation to that point (with a two-click confirm).
 *
 * A "Save Checkpoint" button lets users create manual checkpoints.
 * Auto-checkpoints are created on every user message turn.
 */
export function SessionTimeline() {
  const checkpoints = useConversationStore((s) => s.checkpoints);
  const messages = useConversationStore((s) => s.messages);
  const createCheckpoint = useConversationStore((s) => s.createCheckpoint);
  const restoreCheckpoint = useConversationStore((s) => s.restoreCheckpoint);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (checkpoints.length === 0) return null;

  // The "active" checkpoint is the last one whose messageIndex <= messages.length - 1
  const currentMsgIndex = messages.length - 1;
  const activeCheckpointIndex = checkpoints.reduce((best, cp, i) => {
    if (cp.messageIndex <= currentMsgIndex) return i;
    return best;
  }, -1);

  const handleRestore = (index: number) => {
    restoreCheckpoint(index);
  };

  const handleManualCheckpoint = () => {
    createCheckpoint("Manual save");
  };

  return (
    <div
      className="shrink-0 flex items-center gap-2 px-3"
      style={{
        height: "28px",
        backgroundColor: "var(--color-surface-0)",
        borderBottom: "1px solid var(--color-surface-1)",
      }}
      aria-label="Session timeline"
    >
      {/* Label */}
      <div
        className="flex items-center gap-1 shrink-0"
        style={{ color: "var(--color-overlay-1)" }}
        title="Session checkpoints — click a dot to restore"
      >
        <Clock size={10} />
        <span className="text-[10px] font-medium">Timeline</span>
      </div>

      {/* Connecting line + dots */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="flex items-center gap-0 min-w-max px-1">
          {checkpoints.map((cp, i) => (
            <div key={`${cp.timestamp}-${i}`} className="flex items-center">
              {/* Connector line between dots */}
              {i > 0 && (
                <div
                  className="h-px"
                  style={{
                    width: "20px",
                    backgroundColor:
                      i <= activeCheckpointIndex
                        ? "var(--color-blue)"
                        : "var(--color-overlay-0)",
                    opacity: i <= activeCheckpointIndex ? 0.6 : 0.3,
                  }}
                />
              )}
              <CheckpointDot
                checkpoint={cp}
                index={i}
                isActive={i === activeCheckpointIndex}
                onRestore={handleRestore}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Manual checkpoint button */}
      <button
        type="button"
        className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px]
          transition-colors hover:bg-[var(--color-surface-1)]"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={handleManualCheckpoint}
        title="Save a manual checkpoint here"
        aria-label="Save checkpoint"
      >
        <Plus size={10} />
        <span>Save</span>
      </button>
    </div>
  );
}
