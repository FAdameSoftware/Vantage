import { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
        aria-expanded={thinkingText ? expanded : undefined}
      >
        <Brain
          size={14}
          className="animate-pulse"
          style={{ color: "var(--color-mauve)" }}
        />
        <span>Thinking...</span>
        <span className="tabular-nums">{elapsed}s</span>
      </button>

      <AnimatePresence>
        {expanded && thinkingText && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              className="text-xs italic ml-5 pl-3 whitespace-pre-wrap break-words"
              style={{
                color: "var(--color-overlay-1)",
                borderLeft: "2px solid var(--color-mauve)",
              }}
            >
              {thinkingText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
