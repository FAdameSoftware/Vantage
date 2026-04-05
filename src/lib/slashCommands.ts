export interface SlashCommand {
  /** The command name without the leading "/" */
  name: string;
  /** Short description shown in the autocomplete */
  description: string;
  /** "built-in" or the plugin/skill name that provides it */
  source: "built-in" | string;
  /** Whether this is a skill (invoked via Skill tool) vs a CLI command */
  isSkill: boolean;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "branch", description: "Show or switch git branch", source: "built-in", isSkill: false },
  { name: "btw", description: "Ask a quick question (zero context cost)", source: "built-in", isSkill: false },
  { name: "bug", description: "Report a bug to Anthropic", source: "built-in", isSkill: false },
  { name: "clear", description: "Clear conversation history", source: "built-in", isSkill: false },
  { name: "compact", description: "Compact conversation to reduce context usage", source: "built-in", isSkill: false },
  { name: "config", description: "View or edit Claude Code configuration", source: "built-in", isSkill: false },
  { name: "context", description: "Show current context window usage", source: "built-in", isSkill: false },
  { name: "cost", description: "Show token usage and cost for this session", source: "built-in", isSkill: false },
  { name: "diff", description: "Show git diff of working changes", source: "built-in", isSkill: false },
  { name: "doctor", description: "Check Claude Code installation health", source: "built-in", isSkill: false },
  { name: "export", description: "Export conversation (md/json/html)", source: "built-in", isSkill: false },
  { name: "fast", description: "Toggle fast mode for quicker responses", source: "built-in", isSkill: false },
  { name: "help", description: "Show available commands and usage information", source: "built-in", isSkill: false },
  { name: "init", description: "Initialize CLAUDE.md in the current project", source: "built-in", isSkill: false },
  { name: "interview", description: "Claude interviews you to gather requirements before building", source: "built-in", isSkill: false },
  { name: "login", description: "Log in to your Anthropic account", source: "built-in", isSkill: false },
  { name: "logout", description: "Log out of your Anthropic account", source: "built-in", isSkill: false },
  { name: "memory", description: "View or edit CLAUDE.md project memory", source: "built-in", isSkill: false },
  { name: "model", description: "Show or change the AI model", source: "built-in", isSkill: false },
  { name: "permissions", description: "View or modify tool permissions", source: "built-in", isSkill: false },
  { name: "review", description: "Review recent code changes", source: "built-in", isSkill: false },
  { name: "rewind", description: "Rewind conversation to a previous point", source: "built-in", isSkill: false },
  { name: "status", description: "Show current session status", source: "built-in", isSkill: false },
  { name: "tasks", description: "Show agent tasks and status", source: "built-in", isSkill: false },
  { name: "usage", description: "Show detailed usage statistics", source: "built-in", isSkill: false },
  { name: "vim", description: "Toggle vim keybinding mode", source: "built-in", isSkill: false },
];

/**
 * Builds a combined, alphabetically-sorted command list from built-in commands
 * plus any installed skills.
 */
export function buildCommandList(
  skills: Array<{ name: string; description: string; source: string }>,
): SlashCommand[] {
  const combined: SlashCommand[] = [...BUILTIN_COMMANDS];

  for (const skill of skills) {
    combined.push({
      name: skill.name,
      description: skill.description,
      source: skill.source,
      isSkill: true,
    });
  }

  combined.sort((a, b) => a.name.localeCompare(b.name));
  return combined;
}

/**
 * Filters and ranks a command list by the user's query string.
 * - Empty query returns all commands (up to 12).
 * - Exact prefix matches on name come first, then contains-name, then
 *   description-only matches.
 * - Results are capped at 12.
 */
export function filterCommands(
  commands: SlashCommand[],
  query: string,
): SlashCommand[] {
  if (!query) return commands.slice(0, 12);

  const q = query.toLowerCase();

  const prefixName: SlashCommand[] = [];
  const containsName: SlashCommand[] = [];
  const descOnly: SlashCommand[] = [];

  for (const cmd of commands) {
    const nameLower = cmd.name.toLowerCase();
    const descLower = cmd.description.toLowerCase();

    if (nameLower.startsWith(q)) {
      prefixName.push(cmd);
    } else if (nameLower.includes(q)) {
      containsName.push(cmd);
    } else if (descLower.includes(q)) {
      descOnly.push(cmd);
    }
  }

  return [...prefixName, ...containsName, ...descOnly].slice(0, 12);
}
