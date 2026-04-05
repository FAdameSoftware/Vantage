import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Hammer, Network, Target, ShieldCheck, Sparkles } from "lucide-react";
import { useAgentsStore } from "@/stores/agents";
import type { AgentRole } from "@/stores/agents";
import { useAgentsMd } from "@/hooks/useAgentsMd";
import type { AgentRoleDefinition } from "@/lib/agentsmd";

// ── Available models ─────────────────────────────────────────────────

const MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

// ── Role options ─────────────────────────────────────────────────────

const ROLE_OPTIONS: {
  role: AgentRole;
  label: string;
  description: string;
  Icon: React.ElementType;
}[] = [
  {
    role: "builder",
    label: "Builder",
    description: "General-purpose coding agent",
    Icon: Hammer,
  },
  {
    role: "coordinator",
    label: "Coordinator",
    description: "Creates and manages child agents",
    Icon: Network,
  },
  {
    role: "specialist",
    label: "Specialist",
    description: "Focused on a specific subtask",
    Icon: Target,
  },
  {
    role: "verifier",
    label: "Verifier",
    description: "Validates work after specialists finish",
    Icon: ShieldCheck,
  },
];

// ── Component ────────────────────────────────────────────────────────

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled parent agent ID when creating a child agent */
  parentId?: string | null;
}

export function CreateAgentDialog({
  open,
  onOpenChange,
  parentId = null,
}: CreateAgentDialogProps) {
  const createAgent = useAgentsStore((s) => s.createAgent);
  const { config: agentsMdConfig, suggest } = useAgentsMd();

  const [name, setName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [role, setRole] = useState<AgentRole>("builder");
  const [suggestedRole, setSuggestedRole] = useState<AgentRoleDefinition | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce role suggestion when task description changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!taskDescription.trim() || !agentsMdConfig) {
      setSuggestedRole(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const match = suggest(taskDescription);
      setSuggestedRole(match);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [taskDescription, agentsMdConfig, suggest]);

  function applySuggestion() {
    if (!suggestedRole) return;
    setRole(suggestedRole.agentRole);
    setModel(suggestedRole.model);
    if (!name.trim()) {
      // Auto-fill name from role
      setName(suggestedRole.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
    }
    setSuggestedRole(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const agentId = createAgent({
      name: name.trim(),
      taskDescription: taskDescription.trim(),
      model,
      role,
      parentId,
    });

    // Auto-start the agent session by dispatching an event that useClaude listens for.
    // This mirrors the pattern used by "Investigate with Claude" in FileExplorer.
    const trimmedTask = taskDescription.trim();
    if (trimmedTask) {
      window.dispatchEvent(
        new CustomEvent("vantage:agent-auto-start", {
          detail: { agentId, taskDescription: trimmedTask },
        }),
      );
    }

    // Reset form and close
    setName("");
    setTaskDescription("");
    setModel(MODELS[0].id);
    setRole("builder");
    setSuggestedRole(null);
    onOpenChange(false);
  }

  function handleClose() {
    setName("");
    setTaskDescription("");
    setModel(MODELS[0].id);
    setRole("builder");
    setSuggestedRole(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Agent</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="agent-name"
              className="text-xs font-medium"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Name
            </label>
            <Input
              id="agent-name"
              placeholder="e.g. Backend Agent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Task description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="agent-task"
              className="text-xs font-medium"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Task Description
            </label>
            <Textarea
              id="agent-task"
              placeholder="Describe what this agent should work on…"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* AGENTS.md role suggestion */}
          {suggestedRole && (
            <div
              className="flex items-start gap-2 rounded-md px-2.5 py-2"
              style={{
                backgroundColor: "var(--color-surface-1)",
                border: "1px solid var(--color-accent)",
              }}
            >
              <Sparkles
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--color-accent)" }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  Suggested role: {suggestedRole.name}{" "}
                  <span style={{ color: "var(--color-subtext-0)" }}>
                    ({suggestedRole.model})
                  </span>
                </p>
                {suggestedRole.description && (
                  <p
                    className="text-[10px] leading-snug mt-0.5"
                    style={{ color: "var(--color-overlay-1)" }}
                  >
                    {suggestedRole.description}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={applySuggestion}
              >
                Apply
              </Button>
            </div>
          )}

          {/* Model selector */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="agent-model"
              className="text-xs font-medium"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Model
            </label>
            <select
              id="agent-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 transition-colors"
              style={{
                backgroundColor: "transparent",
                borderColor: "var(--color-surface-1)",
                color: "var(--color-text)",
              }}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Role selector */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--color-subtext-0)" }}
            >
              Role
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLE_OPTIONS.map(({ role: r, label, description, Icon }) => {
                const isSelected = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="flex items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors"
                    style={{
                      backgroundColor: isSelected
                        ? "var(--color-surface-1)"
                        : "transparent",
                      border: `1px solid ${isSelected ? "var(--color-accent)" : "var(--color-surface-1)"}`,
                      outline: "none",
                    }}
                  >
                    <Icon
                      size={14}
                      className="mt-0.5 shrink-0"
                      style={{
                        color: isSelected
                          ? "var(--color-accent)"
                          : "var(--color-overlay-1)",
                      }}
                    />
                    <div className="flex flex-col">
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: isSelected
                            ? "var(--color-text)"
                            : "var(--color-subtext-0)",
                        }}
                      >
                        {label}
                      </span>
                      <span
                        className="text-[10px] leading-snug"
                        style={{ color: "var(--color-overlay-1)" }}
                      >
                        {description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create Agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
