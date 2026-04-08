import { useState, useRef, useCallback } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";
import { useClickOutside } from "@/hooks/useClickOutside";

type EffortLevel = "low" | "medium" | "high";

interface EffortOption {
  value: EffortLevel;
  label: string;
  description: string;
  color: string;
}

const EFFORT_OPTIONS: EffortOption[] = [
  {
    value: "high",
    label: "High",
    description: "Max reasoning depth",
    color: "var(--color-green)",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced speed & depth",
    color: "var(--color-yellow)",
  },
  {
    value: "low",
    label: "Low",
    description: "Fastest responses",
    color: "var(--color-red)",
  },
];

function effortColor(level: EffortLevel): string {
  switch (level) {
    case "high":
      return "var(--color-green)";
    case "medium":
      return "var(--color-yellow)";
    case "low":
      return "var(--color-red)";
  }
}

export function EffortLevelSelector() {
  const effortLevel = useSettingsStore((s) => s.effortLevel);
  const setEffortLevel = useSettingsStore((s) => s.setEffortLevel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  const closeDropdown = useCallback(() => setOpen(false), []);
  useClickOutside(ref, closeDropdown, open);

  const currentOption = EFFORT_OPTIONS.find((o) => o.value === effortLevel)!;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
        aria-label={`Effort level: ${currentOption.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <Gauge size={11} style={{ color: effortColor(effortLevel) }} />
        <span style={{ color: effortColor(effortLevel) }}>{currentOption.label}</span>
        <ChevronDown size={10} className={open ? "rotate-180" : ""} style={{ transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div
          className="absolute bottom-7 left-0 z-50 rounded shadow-lg py-1 min-w-[160px]"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
          role="listbox"
          aria-label="Effort level options"
        >
          {EFFORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={effortLevel === option.value}
              className="flex flex-col w-full px-3 py-1.5 text-left hover:bg-[var(--color-surface-1)] transition-colors"
              onClick={() => {
                setEffortLevel(option.value);
                setOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: option.color }}
                />
                <span
                  className="text-xs font-medium"
                  style={{
                    color:
                      effortLevel === option.value
                        ? option.color
                        : "var(--color-text)",
                  }}
                >
                  {option.label}
                </span>
                {effortLevel === option.value && (
                  <span
                    className="ml-auto text-[10px]"
                    style={{ color: option.color }}
                  >
                    ✓
                  </span>
                )}
              </div>
              <span
                className="text-[10px] ml-4 mt-0.5"
                style={{ color: "var(--color-overlay-1)" }}
              >
                {option.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
