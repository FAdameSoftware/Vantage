import { useState } from "react";
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
import { useAgentsStore } from "@/stores/agents";

// ── Available models ─────────────────────────────────────────────────

const MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

// ── Component ────────────────────────────────────────────────────────

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAgentDialog({
  open,
  onOpenChange,
}: CreateAgentDialogProps) {
  const createAgent = useAgentsStore((s) => s.createAgent);

  const [name, setName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [model, setModel] = useState<string>(MODELS[0].id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    createAgent({
      name: name.trim(),
      taskDescription: taskDescription.trim(),
      model,
    });

    // Reset form and close
    setName("");
    setTaskDescription("");
    setModel(MODELS[0].id);
    onOpenChange(false);
  }

  function handleClose() {
    setName("");
    setTaskDescription("");
    setModel(MODELS[0].id);
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
