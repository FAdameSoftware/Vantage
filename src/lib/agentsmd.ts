import type { AgentRole } from "@/stores/agents";
import { DEFAULT_MODEL_ID } from "@/lib/models";

// ── Parsed types ────────────────────────────────────────────────────

export interface AgentRoleDefinition {
  /** Role name (the ## heading text, typically kebab-case) */
  name: string;
  /** Model to use for this role */
  model: string;
  /** Human-readable description */
  description: string;
  /** Keywords that trigger this role suggestion */
  triggers: string[];
  /** Glob patterns for files this role owns */
  filePatterns: string[];
  /** Maps to the AgentRole type from the agents store */
  agentRole: AgentRole;
}

export interface AgentsMdConfig {
  roles: AgentRoleDefinition[];
  /** The raw markdown content */
  raw: string;
}

// ── Parser ──────────────────────────────────────────────────────────

/**
 * Infer the AgentRole from a role name string.
 *
 * - Contains "coordinator" or "lead" -> "coordinator"
 * - Contains "verifier" or "reviewer" -> "verifier"
 * - Contains "specialist" -> "specialist"
 * - Otherwise -> "builder"
 */
function inferAgentRole(name: string): AgentRole {
  const lower = name.toLowerCase();
  if (lower.includes("coordinator") || lower.includes("lead")) {
    return "coordinator";
  }
  if (lower.includes("verifier") || lower.includes("reviewer")) {
    return "verifier";
  }
  if (lower.includes("specialist")) {
    return "specialist";
  }
  return "builder";
}

/**
 * Parse a comma-separated value from a line like `- Triggers: "api", "endpoint", "server"`
 * or `- Triggers: api, endpoint, server`.
 */
function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

/**
 * Parse an AGENTS.md markdown file into a structured config.
 *
 * Expected format:
 * ```markdown
 * # Agent Roles
 *
 * ## coordinator
 * - Model: claude-opus-4-6
 * - Description: Orchestrates work across specialists
 * - Triggers: "plan", "architect", "design"
 * - Files: src/api/**, src/db/**
 *
 * ## backend-specialist
 * - Model: claude-sonnet-4-6
 * - Description: Backend API and database work
 * - Triggers: "api", "endpoint", "database"
 * - Files: src/api/**, src/db/**
 * ```
 *
 * The parser is lenient: missing fields get sensible defaults, and
 * unrecognized lines are ignored.
 */
export function parseAgentsMd(content: string): AgentsMdConfig {
  const roles: AgentRoleDefinition[] = [];
  const lines = content.split("\n");

  let currentRole: Partial<AgentRoleDefinition> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect ## heading as a new role section
    if (trimmed.startsWith("## ")) {
      // Save previous role if any
      if (currentRole?.name) {
        roles.push(finalizeRole(currentRole));
      }

      const name = trimmed.slice(3).trim();
      currentRole = {
        name,
        model: DEFAULT_MODEL_ID,
        description: "",
        triggers: [],
        filePatterns: [],
        agentRole: inferAgentRole(name),
      };
      continue;
    }

    // Skip if we're not inside a role section
    if (!currentRole) continue;

    // Parse bullet-point properties
    const bulletMatch = trimmed.match(/^-\s+(\w[\w-]*):\s*(.+)$/);
    if (!bulletMatch) continue;

    const key = bulletMatch[1].toLowerCase();
    const value = bulletMatch[2].trim();

    switch (key) {
      case "model":
        currentRole.model = value;
        break;
      case "description":
        currentRole.description = value;
        break;
      case "triggers":
        currentRole.triggers = parseCommaSeparated(value);
        break;
      case "files":
        currentRole.filePatterns = parseCommaSeparated(value);
        break;
    }
  }

  // Don't forget the last role
  if (currentRole?.name) {
    roles.push(finalizeRole(currentRole));
  }

  return { roles, raw: content };
}

/** Fill in defaults for any missing fields */
function finalizeRole(partial: Partial<AgentRoleDefinition>): AgentRoleDefinition {
  return {
    name: partial.name ?? "unknown",
    model: partial.model ?? DEFAULT_MODEL_ID,
    description: partial.description ?? "",
    triggers: partial.triggers ?? [],
    filePatterns: partial.filePatterns ?? [],
    agentRole: partial.agentRole ?? "builder",
  };
}

// ── Role suggestion ─────────────────────────────────────────────────

/**
 * Given a task description and parsed AGENTS.md config, find the best
 * matching role based on trigger keyword overlap.
 *
 * Returns `null` if no triggers match.
 */
export function suggestRole(
  taskDescription: string,
  config: AgentsMdConfig,
): AgentRoleDefinition | null {
  const lower = taskDescription.toLowerCase();
  let bestMatch: AgentRoleDefinition | null = null;
  let bestScore = 0;

  for (const role of config.roles) {
    let score = 0;
    for (const trigger of role.triggers) {
      if (lower.includes(trigger.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = role;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

// ── Default template ────────────────────────────────────────────────

export const AGENTS_MD_TEMPLATE = `# Agent Roles

## coordinator
- Model: claude-opus-4-6
- Description: Orchestrates work across specialists
- Triggers: plan, architect, design, coordinate, organize

## backend-specialist
- Model: claude-sonnet-4-6
- Description: Backend API and database work
- Triggers: api, endpoint, database, migration, server, backend
- Files: src/api/**, src/db/**, src/models/**

## frontend-specialist
- Model: claude-sonnet-4-6
- Description: UI components and styling
- Triggers: component, ui, css, layout, page, form, frontend
- Files: src/components/**, src/styles/**

## test-specialist
- Model: claude-sonnet-4-6
- Description: Writing and fixing tests
- Triggers: test, spec, coverage, fixture
- Files: src/__tests__/**, tests/**

## verifier
- Model: claude-sonnet-4-6
- Description: Reviews and validates completed work
- Triggers: review, verify, check, validate
`;
