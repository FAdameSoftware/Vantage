import type { SlashCommand } from "@/lib/slashCommands";

interface SlashAutocompleteProps {
  commands: SlashCommand[];
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  visible: boolean;
}

export function SlashAutocomplete({
  commands,
  selectedIndex,
  onSelect,
  visible,
}: SlashAutocompleteProps) {
  if (!visible || commands.length === 0) return null;

  return (
    <div
      className="absolute rounded-md shadow-lg overflow-y-auto z-50"
      style={{
        bottom: "100%",
        left: 0,
        right: 0,
        maxHeight: 300,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {commands.map((cmd, i) => (
        <div
          key={cmd.name}
          className="px-2 py-1.5 cursor-pointer"
          style={{
            backgroundColor:
              i === selectedIndex ? "var(--color-surface-1)" : undefined,
          }}
          onClick={() => onSelect(cmd)}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-mono"
              style={{
                color: cmd.isSkill
                  ? "var(--color-mauve)"
                  : "var(--color-blue)",
              }}
            >
              /{cmd.name}
            </span>
            {cmd.source !== "built-in" && (
              <span
                className="text-[9px] px-1 rounded"
                style={{
                  backgroundColor: "var(--color-surface-1)",
                  color: "var(--color-overlay-1)",
                }}
              >
                {cmd.source}
              </span>
            )}
          </div>
          <p
            className="text-[10px] truncate"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {cmd.description}
          </p>
        </div>
      ))}
    </div>
  );
}
