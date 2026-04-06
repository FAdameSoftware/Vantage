import { Bot, MessageSquare, Loader2, CircleCheck, CircleAlert } from "lucide-react";
import type { ToolCall } from "@/stores/conversation";
import type { WidgetProps } from "./types";
import { WidgetShell } from "./WidgetShell";

// ─── Types ─────────────────────────────────────────────────────────────────

type AgentStatus = "working" | "idle" | "error" | "completed";

interface AgentInfo {
  name: string;
  role?: string;
  status: AgentStatus;
  task?: string;
  tokens?: number;
  cost?: number;
}

// ─── Parse agent info from tool call ──────────────────────────────────────

function parseAgentInfo(toolCall: ToolCall): AgentInfo {
  const { input, output, isError, isExecuting } = toolCall;

  // Determine status
  let status: AgentStatus = "idle";
  if (isExecuting) status = "working";
  else if (isError) status = "error";
  else if (output) status = "completed";

  // Extract agent name from various input shapes
  const name = String(
    input.agent_name ?? input.agentName ?? input.name ?? input.agent ?? input.recipient ?? toolCall.name,
  );

  // Extract role
  const role = input.role ? String(input.role) : undefined;

  // Extract task/message
  const task = String(input.task ?? input.message ?? input.prompt ?? input.content ?? input.description ?? "");

  // Try to extract cost/tokens from output
  let tokens: number | undefined;
  let cost: number | undefined;

  if (output) {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed === "object" && parsed !== null) {
        if (typeof parsed.tokens === "number") tokens = parsed.tokens;
        if (typeof parsed.total_tokens === "number") tokens = parsed.total_tokens;
        if (typeof parsed.cost === "number") cost = parsed.cost;
        if (typeof parsed.total_cost === "number") cost = parsed.total_cost;
      }
    } catch {
      // Output is not JSON, that's fine
    }
  }

  return { name, role, status, task, tokens, cost };
}

// ─── Status indicator ──────────────────────────────────────────────────────

const statusConfig: Record<AgentStatus, { color: string; label: string }> = {
  working: { color: "var(--color-blue)", label: "working" },
  idle: { color: "var(--color-overlay-1)", label: "idle" },
  error: { color: "var(--color-red)", label: "error" },
  completed: { color: "var(--color-green)", label: "done" },
};

function StatusBadge({ status }: { status: AgentStatus }) {
  const cfg = statusConfig[status];
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{
        backgroundColor: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
        color: cfg.color,
      }}
    >
      {status === "working" && <Loader2 size={9} className="animate-spin" />}
      {status === "completed" && <CircleCheck size={9} />}
      {status === "error" && <CircleAlert size={9} />}
      {cfg.label}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  // Color by role type
  let color = "var(--color-mauve)";
  const r = role.toLowerCase();
  if (r === "coordinator" || r === "orchestrator") color = "var(--color-mauve)";
  else if (r === "specialist" || r === "worker") color = "var(--color-blue)";
  else if (r === "verifier" || r === "reviewer") color = "var(--color-peach)";

  return (
    <span
      className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase flex-shrink-0"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {role}
    </span>
  );
}

// ─── Compact header ────────────────────────────────────────────────────────

function AgentCompactHeader({ info, toolName }: { info: AgentInfo; toolName: string }) {
  const isSendMessage = toolName === "SendMessage";
  const Icon = isSendMessage ? MessageSquare : Bot;
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Icon size={13} style={{ color: "var(--color-mauve)" }} className="flex-shrink-0" />
      <span className="text-xs flex-shrink-0 font-medium" style={{ color: "var(--color-text)" }}>
        {info.name}
      </span>
      {info.role && <RoleBadge role={info.role} />}
      <StatusBadge status={info.status} />
    </div>
  );
}

// ─── Expanded content ──────────────────────────────────────────────────────

function AgentExpandedContent({ toolCall }: { toolCall: ToolCall }) {
  const info = parseAgentInfo(toolCall);
  const { output } = toolCall;

  return (
    <div className="flex flex-col gap-2">
      {/* Agent identity + role */}
      <div
        className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
        style={{
          backgroundColor: "rgba(203, 166, 247, 0.08)",
          border: "1px solid rgba(203, 166, 247, 0.15)",
        }}
      >
        <Bot size={12} style={{ color: "var(--color-mauve)" }} className="flex-shrink-0" />
        <span className="font-medium" style={{ color: "var(--color-mauve)" }}>{info.name}</span>
        {info.role && <RoleBadge role={info.role} />}
        <StatusBadge status={info.status} />
      </div>

      {/* Task description */}
      {info.task && (
        <div
          className="text-xs px-2 py-1.5 rounded"
          style={{
            backgroundColor: "var(--color-mantle)",
            border: "1px solid var(--color-surface-0)",
            color: "var(--color-text)",
          }}
        >
          {info.task}
        </div>
      )}

      {/* Token/cost summary */}
      {(info.tokens !== undefined || info.cost !== undefined) && (
        <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--color-subtext-0)" }}>
          {info.tokens !== undefined && (
            <span>{info.tokens.toLocaleString()} tokens</span>
          )}
          {info.cost !== undefined && (
            <span>${info.cost.toFixed(4)}</span>
          )}
        </div>
      )}

      {/* Raw output (truncated) */}
      {output && (
        <div
          className="rounded-md overflow-hidden"
          style={{
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <div
            className="text-[10px] px-2.5 py-1 font-medium"
            style={{
              color: "var(--color-subtext-0)",
              backgroundColor: "var(--color-surface-0)",
              borderBottom: "1px solid var(--color-surface-1)",
            }}
          >
            Response
          </div>
          <pre
            className="text-xs m-0 p-2.5 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto"
            style={{
              fontFamily: "var(--font-mono)",
              color: toolCall.isError ? "var(--color-red)" : "var(--color-subtext-0)",
              backgroundColor: "var(--color-crust)",
            }}
          >
            {output.length > 2000 ? output.slice(0, 2000) + "\n... (truncated)" : output}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── AgentWidget ───────────────────────────────────────────────────────────

export function AgentWidget({ toolCall, forceExpanded }: WidgetProps) {
  const info = parseAgentInfo(toolCall);
  return (
    <WidgetShell
      toolCall={toolCall}
      forceExpanded={forceExpanded}
      compactHeader={<AgentCompactHeader info={info} toolName={toolCall.name} />}
    >
      <AgentExpandedContent toolCall={toolCall} />
    </WidgetShell>
  );
}
