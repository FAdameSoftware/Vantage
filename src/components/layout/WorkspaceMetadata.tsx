import { useState, useEffect } from "react";
import {
  GitBranch,
  Server,
  Coins,
  Bot,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { useConversationStore } from "@/stores/conversation";
import { useAgentsStore } from "@/stores/agents";
import { useGitStatus } from "@/hooks/useGitStatus";
import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────

interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

// ── Port detection ─────────────────────────────────────────────────────
// Scans the document for any terminal output that matches localhost:PORT patterns.
// Returns a deduplicated list of detected port numbers.
function useDetectedPorts(): number[] {
  const [ports, setPorts] = useState<number[]>([]);

  useEffect(() => {
    const scan = () => {
      const terminalText = document.querySelector(".xterm-screen")?.textContent ?? "";
      const matches = terminalText.matchAll(/localhost:(\d{4,5})/g);
      const found = new Set<number>();
      for (const m of matches) {
        const port = parseInt(m[1], 10);
        if (port >= 1024 && port <= 65535) found.add(port);
      }
      setPorts(Array.from(found).sort((a, b) => a - b));
    };

    scan();
    const id = setInterval(scan, 5000);
    return () => clearInterval(id);
  }, []);

  return ports;
}

// ── Last commit message ────────────────────────────────────────────────

function useLastCommit(rootPath: string | null): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!rootPath) return;

    const fetch = async () => {
      try {
        const entries = await invoke<GitLogEntry[]>("git_log", {
          cwd: rootPath,
          limit: 1,
        });
        if (entries.length > 0) {
          setMessage(entries[0].message.split("\n")[0].trim());
        }
      } catch {
        setMessage(null);
      }
    };

    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [rootPath]);

  return message;
}

// ── Collapsible section ────────────────────────────────────────────────

interface SectionProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function MetadataSection({ label, icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider
          hover:bg-[var(--color-surface-0)] transition-colors"
        style={{ color: "var(--color-subtext-0)" }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {icon}
        {label}
      </button>
      {open && (
        <div className="px-3 pb-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function WorkspaceMetadata() {
  const rootPath = useLayoutStore((s) => s.projectRootPath);
  const { branch, isGitRepo, allStatuses } = useGitStatus(rootPath);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const totalCost = useConversationStore((s) => s.totalCost);
  const totalTokens = useConversationStore((s) => s.totalTokens);
  const session = useConversationStore((s) => s.session);

  const agentsMap = useAgentsStore((s) => s.agents);
  const activeAgentCount = Array.from(agentsMap.values()).filter(
    (a) => a.status === "working" || a.status === "waiting_permission"
  ).length;

  const ports = useDetectedPorts();
  const lastCommit = useLastCommit(isGitRepo ? rootPath : null);

  const dirtyCount = allStatuses.length;

  if (!rootPath) return null;

  return (
    <div
      className="shrink-0 overflow-y-auto text-xs"
      style={{
        backgroundColor: "var(--color-mantle)",
        borderBottom: "1px solid var(--color-surface-0)",
        maxHeight: "180px",
      }}
    >
      {/* Git section */}
      {isGitRepo && (
        <MetadataSection
          label="Git"
          icon={<GitBranch size={10} />}
        >
          <button
            type="button"
            className="flex items-center gap-1 w-full text-left hover:text-[var(--color-blue)] transition-colors"
            style={{ color: "var(--color-text)" }}
            onClick={() => setActiveActivityBarItem("git")}
            title="Open Source Control"
          >
            <GitBranch size={11} style={{ color: "var(--color-blue)", flexShrink: 0 }} />
            <span className="truncate font-medium">
              {branch?.is_detached ? `(${branch.branch})` : (branch?.branch ?? "—")}
            </span>
            {dirtyCount > 0 && (
              <span
                className="ml-auto shrink-0 px-1 rounded-sm text-[10px]"
                style={{
                  backgroundColor: "var(--color-surface-1)",
                  color: "var(--color-peach)",
                }}
              >
                {dirtyCount} changed
              </span>
            )}
          </button>

          {lastCommit && (
            <div
              className="flex items-center gap-1 mt-0.5 truncate"
              style={{ color: "var(--color-overlay-1)" }}
              title={lastCommit}
            >
              <GitCommitHorizontal size={10} style={{ flexShrink: 0 }} />
              <span className="truncate">{lastCommit}</span>
            </div>
          )}
        </MetadataSection>
      )}

      {/* Ports section */}
      {ports.length > 0 && (
        <MetadataSection
          label="Dev Servers"
          icon={<Server size={10} />}
          defaultOpen={true}
        >
          <div className="flex flex-wrap gap-1">
            {ports.map((port) => (
              <a
                key={port}
                href={`http://localhost:${port}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono
                  hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: "var(--color-surface-1)",
                  color: "var(--color-green)",
                }}
                title={`Open localhost:${port}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--color-green)" }}
                />
                :{port}
              </a>
            ))}
          </div>
        </MetadataSection>
      )}

      {/* Claude section */}
      {session && (
        <MetadataSection
          label="Claude"
          icon={<Coins size={10} />}
          defaultOpen={true}
        >
          <div className="flex items-center gap-3" style={{ color: "var(--color-text)" }}>
            <span style={{ color: "var(--color-overlay-1)" }}>
              Cost:{" "}
              <span style={{ color: "var(--color-peach)" }}>
                ${totalCost.toFixed(4)}
              </span>
            </span>
            {(totalTokens.input + totalTokens.output) > 0 && (
              <span style={{ color: "var(--color-overlay-1)" }}>
                Tokens:{" "}
                <span style={{ color: "var(--color-text)" }}>
                  {((totalTokens.input + totalTokens.output) / 1000).toFixed(1)}k
                </span>
              </span>
            )}
          </div>
        </MetadataSection>
      )}

      {/* Active agents section */}
      {activeAgentCount > 0 && (
        <MetadataSection
          label="Agents"
          icon={<Bot size={10} />}
          defaultOpen={true}
        >
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-[var(--color-blue)] transition-colors"
            style={{ color: "var(--color-text)" }}
            onClick={() => setActiveActivityBarItem("agents")}
            title="Open Agents panel"
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--color-green)" }}
            />
            <span>
              {activeAgentCount} agent{activeAgentCount !== 1 ? "s" : ""} running
            </span>
          </button>
        </MetadataSection>
      )}
    </div>
  );
}
