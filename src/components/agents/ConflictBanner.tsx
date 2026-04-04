import { useState, useMemo } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAgentsStore } from "@/stores/agents";

/**
 * Banner that appears at the top of the file explorer when file conflicts exist.
 * A conflict means multiple agents are touching the same file.
 */
export function ConflictBanner() {
  const [dismissed, setDismissed] = useState(false);
  const agents = useAgentsStore((s) => s.agents);

  // Compute conflicting files: files touched by more than one agent
  const conflicts = useMemo(() => {
    const fileToAgents = new Map<string, { agentId: string; agentName: string; color: string }[]>();

    for (const agent of agents.values()) {
      for (const filePath of agent.assignedFiles) {
        const existing = fileToAgents.get(filePath) ?? [];
        existing.push({ agentId: agent.id, agentName: agent.name, color: agent.color });
        fileToAgents.set(filePath, existing);
      }
    }

    // Only keep files with more than one agent
    const conflicting: { filePath: string; agents: { agentId: string; agentName: string; color: string }[] }[] = [];
    for (const [filePath, agentList] of fileToAgents) {
      if (agentList.length > 1) {
        conflicting.push({ filePath, agents: agentList });
      }
    }

    return conflicting;
  }, [agents]);

  if (dismissed || conflicts.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-1 px-2 py-1.5 text-xs shrink-0"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-yellow) 15%, var(--color-mantle))",
        borderBottom: "1px solid var(--color-yellow)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        <AlertTriangle
          size={12}
          style={{ color: "var(--color-yellow)" }}
          className="shrink-0"
        />
        <span
          className="flex-1 font-semibold"
          style={{ color: "var(--color-yellow)" }}
        >
          {conflicts.length} file{conflicts.length !== 1 ? "s" : ""} with agent conflicts
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="flex items-center justify-center w-4 h-4 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          aria-label="Dismiss conflict banner"
        >
          <X size={10} />
        </button>
      </div>

      {/* Conflict list */}
      <div className="flex flex-col gap-0.5 pl-4">
        {conflicts.slice(0, 5).map(({ filePath, agents: conflictAgents }) => {
          const fileName = filePath.split("/").pop() ?? filePath;
          return (
            <div key={filePath} className="flex items-center gap-1 truncate">
              <span
                className="truncate"
                style={{ color: "var(--color-text)" }}
                title={filePath}
              >
                {fileName}
              </span>
              <span style={{ color: "var(--color-overlay-1)" }}> — </span>
              {conflictAgents.map((a, i) => (
                <span key={a.agentId} className="flex items-center gap-0.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: a.color }}
                  />
                  <span style={{ color: "var(--color-subtext-0)" }}>
                    {a.agentName}
                    {i < conflictAgents.length - 1 ? "," : ""}
                  </span>
                </span>
              ))}
            </div>
          );
        })}
        {conflicts.length > 5 && (
          <span style={{ color: "var(--color-overlay-1)" }}>
            and {conflicts.length - 5} more...
          </span>
        )}
      </div>
    </div>
  );
}
