import { Hash } from "lucide-react";
import {
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

// ── Component ────────────────────────────────────────────────────────

interface GotoViewProps {
  searchText: string;
  onSelect: (lineNumber: number) => void;
}

export function GotoView({ searchText, onSelect }: GotoViewProps) {
  const raw = searchText.startsWith(":") ? searchText.slice(1).trim() : searchText.trim();
  const lineNumber = parseInt(raw, 10);
  const isValid = !isNaN(lineNumber) && lineNumber > 0;

  if (!isValid && raw !== "") return null;

  return (
    <CommandGroup heading="Go to Line">
      <CommandItem
        value={isValid ? `goto-line-${lineNumber}` : "goto-line-prompt"}
        onSelect={() => isValid && onSelect(lineNumber)}
        disabled={!isValid}
      >
        <Hash className="size-4 shrink-0 text-muted-foreground" />
        <span>
          {isValid
            ? `Go to Line ${lineNumber}`
            : "Type a line number after ':'"}
        </span>
      </CommandItem>
    </CommandGroup>
  );
}
