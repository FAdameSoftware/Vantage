import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Lightbulb, Brain, Cpu, Rocket } from "lucide-react";
import { useSettingsStore, type ThinkingMode } from "@/stores/settings";
import { EASE_SMOOTH } from "@/lib/animations";
import { useClickOutside } from "@/hooks/useClickOutside";

// ─── Thinking mode configuration ─────────────────────────────────────────────

interface ThinkingModeConfig {
  id: ThinkingMode;
  name: string;
  description: string;
  /** 0-4: how many signal bars to light up */
  level: number;
  /** Phrase prepended to the message (undefined = none for "auto") */
  phrase?: string;
  icon: React.ReactNode;
}

const THINKING_MODES: ThinkingModeConfig[] = [
  {
    id: "auto",
    name: "Auto",
    description: "Let Claude decide",
    level: 0,
    icon: <Sparkles size={13} />,
  },
  {
    id: "think",
    name: "Think",
    description: "Basic reasoning",
    level: 1,
    phrase: "think",
    icon: <Lightbulb size={13} />,
  },
  {
    id: "think_hard",
    name: "Think Hard",
    description: "Deeper analysis",
    level: 2,
    phrase: "think hard",
    icon: <Brain size={13} />,
  },
  {
    id: "think_harder",
    name: "Think Harder",
    description: "Extensive reasoning",
    level: 3,
    phrase: "think harder",
    icon: <Cpu size={13} />,
  },
  {
    id: "ultrathink",
    name: "Ultrathink",
    description: "Maximum reasoning budget",
    level: 4,
    phrase: "ultrathink",
    icon: <Rocket size={13} />,
  },
];

// ─── Signal bars indicator ───────────────────────────────────────────────────

function SignalBars({ level }: { level: number }) {
  return (
    <div className="flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-[3px] rounded-sm transition-colors duration-150"
          style={{
            height: `${6 + i * 2}px`,
            backgroundColor:
              i <= level
                ? "var(--color-mauve)"
                : "var(--color-surface-1)",
          }}
        />
      ))}
    </div>
  );
}

// ─── Exported helpers ────────────────────────────────────────────────────────

/**
 * Returns the thinking phrase to prepend to a message, or undefined for "auto".
 */
export function getThinkingPhrase(mode: ThinkingMode): string | undefined {
  const config = THINKING_MODES.find((m) => m.id === mode);
  return config?.phrase;
}

/**
 * Returns the label for the currently selected thinking mode.
 */
export function getThinkingModeLabel(mode: ThinkingMode): string {
  const config = THINKING_MODES.find((m) => m.id === mode);
  return config?.name ?? "Auto";
}

// ─── ThinkingModeSelector component ──────────────────────────────────────────

export function ThinkingModeSelector() {
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const setThinkingMode = useSettingsStore((s) => s.setThinkingMode);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = THINKING_MODES.find((m) => m.id === thinkingMode) ?? THINKING_MODES[0];

  // Close on outside click
  const closeDropdown = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, closeDropdown, open);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button: icon + signal bars */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
        style={{
          color: current.level > 0 ? "var(--color-mauve)" : "var(--color-overlay-0)",
        }}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Thinking mode: ${current.name}`}
        title={`Thinking: ${current.name} -- ${current.description}`}
      >
        {current.icon}
        <SignalBars level={current.level} />
      </button>

      {/* Popover dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-full left-0 mb-1.5 rounded-md shadow-lg z-50 py-1 min-w-[200px]"
            style={{
              backgroundColor: "var(--color-surface-0)",
              border: "1px solid var(--color-surface-1)",
            }}
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: EASE_SMOOTH as unknown as number[] }}
          >
            <div
              className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-overlay-0)" }}
            >
              Thinking Mode
            </div>
            {THINKING_MODES.map((mode) => {
              const isSelected = mode.id === thinkingMode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className="flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-1)]"
                  style={{
                    color: isSelected ? "var(--color-mauve)" : "var(--color-text)",
                    backgroundColor: isSelected ? "var(--color-surface-1)" : undefined,
                  }}
                  onClick={() => {
                    setThinkingMode(mode.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className="shrink-0"
                    style={{ color: isSelected ? "var(--color-mauve)" : "var(--color-overlay-1)" }}
                  >
                    {mode.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{mode.name}</span>
                      <SignalBars level={mode.level} />
                    </div>
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--color-overlay-0)" }}
                    >
                      {mode.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
