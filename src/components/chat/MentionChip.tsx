import { X, FileText, TextSelect, Terminal, GitBranch, FolderTree, type LucideProps } from "lucide-react";
import type { ResolvedMention, MentionType } from "@/lib/mentionResolver";

interface MentionChipProps {
  mention: ResolvedMention;
  onRemove: () => void;
}

const ICON_MAP: Record<MentionType, React.ComponentType<LucideProps>> = {
  file: FileText,
  selection: TextSelect,
  terminal: Terminal,
  git: GitBranch,
  folder: FolderTree,
};

export function MentionChip({ mention, onRemove }: MentionChipProps) {
  const Icon = ICON_MAP[mention.type] ?? FileText;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{
        backgroundColor: "var(--color-surface-1)",
        color: "var(--color-blue)",
        border: "1px solid var(--color-surface-2, var(--color-surface-1))",
      }}
    >
      <Icon size={10} />
      <span className="truncate max-w-[140px]">{mention.label}</span>
      <button
        type="button"
        className="ml-0.5 rounded hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-overlay-0)" }}
        onClick={onRemove}
        aria-label={`Remove ${mention.label}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}
