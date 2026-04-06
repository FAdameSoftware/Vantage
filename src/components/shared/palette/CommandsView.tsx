import { useMemo } from "react";
import {
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import type { CommandDef } from "./commandRegistry";

// ── Recent Commands ──────────────────────────────────────────────────

const RECENT_COMMANDS_KEY = "vantage-recent-commands";
const MAX_RECENT_COMMANDS = 10;

export function getRecentCommandIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function addRecentCommandId(id: string): void {
  const current = getRecentCommandIds().filter((c) => c !== id);
  current.unshift(id);
  if (current.length > MAX_RECENT_COMMANDS) current.length = MAX_RECENT_COMMANDS;
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(current));
  } catch {
    // localStorage full or blocked — ignore
  }
}

// ── Component ────────────────────────────────────────────────────────

interface CommandsViewProps {
  commands: CommandDef[];
  searchText: string;
  onSelect: (action: () => void, commandId?: string) => void;
}

export function CommandsView({ commands, searchText, onSelect }: CommandsViewProps) {
  const query = searchText.startsWith(">")
    ? searchText.slice(1).trimStart().toLowerCase()
    : searchText.toLowerCase();

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query))
    : commands;

  // Resolve recent commands (only when there is no active search query)
  const recentIds = useMemo(() => (query ? [] : getRecentCommandIds()), [query]);
  const recentCommands = useMemo(() => {
    if (recentIds.length === 0) return [];
    const cmdMap = new Map(commands.map((c) => [c.id, c]));
    return recentIds.map((id) => cmdMap.get(id)).filter((c): c is CommandDef => c !== undefined);
  }, [recentIds, commands]);

  // Exclude recent commands from the main list to avoid duplicates
  const recentIdSet = useMemo(() => new Set(recentIds), [recentIds]);
  const nonRecentFiltered = query ? filtered : filtered.filter((c) => !recentIdSet.has(c.id));

  // Group by category
  const byCategory = nonRecentFiltered.reduce<Record<string, CommandDef[]>>((acc, cmd) => {
    (acc[cmd.category] ??= []).push(cmd);
    return acc;
  }, {});

  if (filtered.length === 0 && recentCommands.length === 0) {
    return null;
  }

  return (
    <>
      {/* Recent commands section — shown only when not searching */}
      {recentCommands.length > 0 && (
        <CommandGroup heading="Recent">
          {recentCommands.map((cmd) => (
            <CommandItem
              key={`recent-${cmd.id}`}
              value={`recent-${cmd.id}`}
              onSelect={() => onSelect(cmd.action, cmd.id)}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <CommandShortcut>{cmd.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {Object.entries(byCategory).map(([category, cmds]) => (
        <CommandGroup key={category} heading={category}>
          {cmds.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={cmd.id}
              onSelect={() => onSelect(cmd.action, cmd.id)}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <CommandShortcut>{cmd.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
}
