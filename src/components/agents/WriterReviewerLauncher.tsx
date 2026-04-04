import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GitPullRequestDraft } from "lucide-react";
import { useAgentsStore } from "@/stores/agents";

// ── Available models for writer / reviewer ──────────────────────────

const MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

// ── Component ───────────────────────────────────────────────────────

interface WriterReviewerLauncherProps {
  /** Called after the coordinator + specialist + verifier are created */
  onLaunch?: (coordinatorId: string, builderId: string, reviewerId: string) => void;
}

export function WriterReviewerLauncher({ onLaunch }: WriterReviewerLauncherProps) {
  const [open, setOpen] = useState(false);
  const [taskDescription, setTaskDescription] = useState("");
  const [writerModel, setWriterModel] = useState<string>(MODELS[0].id);
  const [reviewerModel, setReviewerModel] = useState<string>(MODELS[0].id);
  const [autoReview, setAutoReview] = useState(true);

  const createAgent = useAgentsStore((s) => s.createAgent);
  const createChildAgent = useAgentsStore((s) => s.createChildAgent);

  const handleLaunch = useCallback(() => {
    const desc = taskDescription.trim();
    if (!desc) return;

    // 1. Create the coordinator
    const coordinatorId = createAgent({
      name: "Build & Review",
      taskDescription: desc,
      role: "coordinator",
    });

    // 2. Create the builder (specialist) under the coordinator
    const builderId = createChildAgent(coordinatorId, {
      name: "Builder",
      taskDescription: desc,
      role: "specialist",
      model: writerModel,
    });

    // 3. Create the reviewer (verifier) under the coordinator
    // The existing auto-trigger in updateAgentStatus will start the verifier
    // when the specialist completes (agents store lines 372-389).
    const reviewerTask = autoReview
      ? `Review the builder's output for: ${desc}. Check for correctness, edge cases, code quality, and completeness. Do not modify files unless fixing critical bugs.`
      : `Review the builder's output for: ${desc}. Provide feedback only.`;

    const reviewerId = createChildAgent(coordinatorId, {
      name: "Reviewer",
      taskDescription: reviewerTask,
      role: "verifier",
      model: reviewerModel,
    });

    // Notify parent
    if (onLaunch && builderId && reviewerId) {
      onLaunch(coordinatorId, builderId, reviewerId);
    }

    // Reset and close
    setTaskDescription("");
    setWriterModel(MODELS[0].id);
    setReviewerModel(MODELS[0].id);
    setAutoReview(true);
    setOpen(false);
  }, [
    taskDescription,
    writerModel,
    reviewerModel,
    autoReview,
    createAgent,
    createChildAgent,
    onLaunch,
  ]);

  const handleClose = useCallback(() => {
    setTaskDescription("");
    setWriterModel(MODELS[0].id);
    setReviewerModel(MODELS[0].id);
    setAutoReview(true);
    setOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-[var(--color-surface-0)]"
        style={{ color: "var(--color-peach)" }}
        onClick={() => setOpen(true)}
        aria-label="Build &amp; Review workflow"
        title="Build &amp; Review — spawn a writer and reviewer agent pair"
      >
        <GitPullRequestDraft size={13} />
        <span className="hidden sm:inline">Build &amp; Review</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Build &amp; Review Workflow</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLaunch();
            }}
            className="flex flex-col gap-3 mt-1"
          >
            {/* Task description */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="wr-task"
                className="text-xs font-medium"
                style={{ color: "var(--color-subtext-0)" }}
              >
                Task Description
              </label>
              <Textarea
                id="wr-task"
                placeholder="Describe what should be built and then reviewed..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={4}
                autoFocus
              />
            </div>

            {/* Model selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="wr-writer-model"
                  className="text-xs font-medium"
                  style={{ color: "var(--color-subtext-0)" }}
                >
                  Writer Model
                </label>
                <select
                  id="wr-writer-model"
                  value={writerModel}
                  onChange={(e) => setWriterModel(e.target.value)}
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

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="wr-reviewer-model"
                  className="text-xs font-medium"
                  style={{ color: "var(--color-subtext-0)" }}
                >
                  Reviewer Model
                </label>
                <select
                  id="wr-reviewer-model"
                  value={reviewerModel}
                  onChange={(e) => setReviewerModel(e.target.value)}
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
            </div>

            {/* Auto-review checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoReview}
                onChange={(e) => setAutoReview(e.target.checked)}
                className="rounded"
              />
              <span
                className="text-xs"
                style={{ color: "var(--color-subtext-0)" }}
              >
                Auto-start review when build completes
              </span>
            </label>

            {/* Workflow explanation */}
            <div
              className="rounded-md px-2.5 py-2 text-[10px] leading-snug"
              style={{
                backgroundColor: "var(--color-surface-1)",
                color: "var(--color-overlay-1)",
              }}
            >
              Creates a coordinator with two child agents: a Builder (specialist)
              that implements the task, and a Reviewer (verifier) that evaluates
              the output. The reviewer auto-starts when the builder finishes.
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!taskDescription.trim()}>
                Launch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
