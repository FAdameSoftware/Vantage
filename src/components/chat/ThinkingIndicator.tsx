import { useState, useEffect } from "react";
import { Brain } from "lucide-react";

interface ThinkingIndicatorProps {
  startedAt: number;
  thinkingText?: string;
}

export function ThinkingIndicator({ startedAt, thinkingText }: ThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="flex flex-col gap-1 py-1">
      <button
        type="button"
        className="flex items-center gap-2 text-xs italic cursor-pointer bg-transparent border-none p-0"
        style={{ color: "var(--color-overlay-1)" }}
        onClick={() => {
          if (thinkingText) setExpanded(!expanded);
        }}
        disabled={!thinkingText}
      >
        <Brain
          size={14}
          className="animate-pulse"
          style={{ color: "var(--color-mauve)" }}
        />
        <span>Thinking...</span>
        <span className="tabular-nums">{elapsed}s</span>
      </button>

      {expanded && thinkingText && (
        <div
          className="text-xs italic ml-5 pl-3 whitespace-pre-wrap break-words"
          style={{
            color: "var(--color-overlay-1)",
            borderLeft: "2px solid var(--color-mauve)",
          }}
        >
          {thinkingText}
        </div>
      )}
    </div>
  );
}
