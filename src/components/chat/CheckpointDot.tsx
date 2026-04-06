import { useState, useRef, useEffect } from "react";
import type { ConversationCheckpoint } from "@/stores/conversation";
import { formatTimestamp24 } from "@/lib/formatters";

interface CheckpointDotProps {
  checkpoint: ConversationCheckpoint;
  index: number;
  isActive: boolean;
  onRestore: (index: number) => void;
}

export function CheckpointDot({ checkpoint, index, isActive, onRestore }: CheckpointDotProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss confirm state after 3 seconds with no second click
  useEffect(() => {
    if (!confirming) return;
    confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [confirming]);

  const handleClick = () => {
    if (confirming) {
      onRestore(index);
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* Tooltip */}
      {(showTooltip || confirming) && (
        <div
          className="absolute bottom-full mb-2 z-50 pointer-events-none"
          style={{ left: "50%", transform: "translateX(-50%)" }}
        >
          <div
            className="px-2 py-1.5 rounded shadow-lg text-[10px] whitespace-nowrap"
            style={{
              backgroundColor: confirming ? "var(--color-peach)" : "var(--color-surface-1)",
              color: confirming ? "var(--color-base)" : "var(--color-text)",
              border: "1px solid var(--color-surface-2)",
              minWidth: "120px",
              maxWidth: "200px",
            }}
          >
            {confirming ? (
              <span className="font-medium">Click again to restore</span>
            ) : (
              <>
                <div
                  className="font-medium truncate"
                  style={{
                    maxWidth: "180px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={checkpoint.label}
                >
                  {checkpoint.label}
                </div>
                <div
                  className="mt-0.5 font-mono"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  {formatTimestamp24(checkpoint.timestamp)}
                </div>
                <div
                  className="mt-0.5"
                  style={{ color: "var(--color-overlay-1)" }}
                >
                  Msg #{checkpoint.messageIndex + 1}
                </div>
              </>
            )}
          </div>
          {/* Arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: confirming
                ? "4px solid var(--color-peach)"
                : "4px solid var(--color-surface-1)",
            }}
          />
        </div>
      )}

      {/* Dot */}
      <button
        type="button"
        className="relative flex items-center justify-center rounded-full transition-all duration-150
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]"
        style={{
          width: confirming ? "14px" : isActive ? "12px" : "8px",
          height: confirming ? "14px" : isActive ? "12px" : "8px",
          backgroundColor: confirming
            ? "var(--color-peach)"
            : isActive
              ? "var(--color-blue)"
              : "var(--color-overlay-1)",
          boxShadow: isActive
            ? "0 0 0 2px var(--color-surface-0), 0 0 0 3px var(--color-blue)"
            : "none",
          flexShrink: 0,
        }}
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => { setShowTooltip(false); }}
        aria-label={`Checkpoint: ${checkpoint.label} at ${formatTimestamp24(checkpoint.timestamp)}. Click to restore.`}
        title={checkpoint.label}
      />
    </div>
  );
}
