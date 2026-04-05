import { FileText, TextSelect, Terminal, GitBranch, FolderTree, type LucideProps } from "lucide-react";
import type { MentionSource, MentionType } from "@/lib/mentionResolver";

interface MentionAutocompleteProps {
  sources: MentionSource[];
  selectedIndex: number;
  onSelect: (source: MentionSource) => void;
  visible: boolean;
}

const ICON_MAP: Record<MentionType, React.ComponentType<LucideProps>> = {
  file: FileText,
  selection: TextSelect,
  terminal: Terminal,
  git: GitBranch,
  folder: FolderTree,
};

export function MentionAutocomplete({
  sources,
  selectedIndex,
  onSelect,
  visible,
}: MentionAutocompleteProps) {
  if (!visible || sources.length === 0) return null;

  return (
    <div
      className="absolute rounded-md shadow-lg overflow-y-auto z-50"
      role="listbox"
      aria-label="Mention sources"
      style={{
        bottom: "100%",
        left: 0,
        right: 0,
        maxHeight: 240,
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {sources.map((source, i) => {
        const Icon = ICON_MAP[source.type] ?? FileText;
        return (
          <div
            key={source.type}
            className="px-2 py-1.5 cursor-pointer"
            role="option"
            id={`mention-option-${source.type}`}
            aria-selected={i === selectedIndex}
            style={{
              backgroundColor:
                i === selectedIndex ? "var(--color-surface-1)" : undefined,
            }}
            onClick={() => onSelect(source)}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={12} style={{ color: "var(--color-green)" }} />
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-green)" }}
              >
                @{source.label}
              </span>
            </div>
            <p
              className="text-[10px] truncate ml-[18px]"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {source.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
