import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Trash2,
  Server,
  Globe,
  FolderOpen,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { toast } from "sonner";

// ── Types (mirroring Rust structs) ─────────────────────────────────

interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  scope: string; // "user" | "project"
}

interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

// ── Add Server Dialog ──────────────────────────────────────────────

function AddServerDialog({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, config: McpServerConfig, scope: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [envText, setEnvText] = useState("");
  const [scope, setScope] = useState<"user" | "project">("project");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    const parsedArgs = args
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);
    const parsedEnv: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        parsedEnv[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
      }
    }

    onAdd(name.trim(), {
      command: command.trim(),
      args: parsedArgs,
      env: parsedEnv,
      enabled: true,
    }, scope);
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--color-base)",
    color: "var(--color-text)",
    border: "1px solid var(--color-surface-1)",
  };

  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center pt-8"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 p-4 rounded-lg w-[320px]"
        style={{
          backgroundColor: "var(--color-surface-0)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Add MCP Server
        </h3>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
            Server Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-2 py-1 text-xs rounded"
            style={inputStyle}
            placeholder="my-server"
            autoFocus
          />
        </div>

        {/* Command */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
            Command
          </label>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="px-2 py-1 text-xs rounded"
            style={inputStyle}
            placeholder="npx -y @modelcontextprotocol/server-name"
          />
        </div>

        {/* Args (one per line) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
            Arguments (one per line)
          </label>
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            className="px-2 py-1 text-xs rounded resize-none"
            style={inputStyle}
            rows={2}
            placeholder={"--port\n3000"}
          />
        </div>

        {/* Env vars (KEY=VALUE per line) */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
            Environment Variables (KEY=VALUE per line)
          </label>
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            className="px-2 py-1 text-xs rounded resize-none"
            style={inputStyle}
            rows={2}
            placeholder="API_KEY=sk-..."
          />
        </div>

        {/* Scope */}
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
            Scope
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScope("project")}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
              style={{
                backgroundColor:
                  scope === "project"
                    ? "var(--color-blue)"
                    : "var(--color-surface-1)",
                color:
                  scope === "project"
                    ? "var(--color-base)"
                    : "var(--color-text)",
              }}
            >
              <FolderOpen size={10} />
              Project
            </button>
            <button
              type="button"
              onClick={() => setScope("user")}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
              style={{
                backgroundColor:
                  scope === "user"
                    ? "var(--color-blue)"
                    : "var(--color-surface-1)",
                color:
                  scope === "user"
                    ? "var(--color-base)"
                    : "var(--color-text)",
              }}
            >
              <Globe size={10} />
              User
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs rounded transition-colors"
            style={{
              backgroundColor: "var(--color-surface-1)",
              color: "var(--color-text)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !command.trim()}
            className="px-3 py-1 text-xs rounded transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-green)",
              color: "var(--color-base)",
            }}
          >
            Add Server
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main MCP Manager Component ─────────────────────────────────────

export function McpManager() {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      const result = await invoke<McpServerEntry[]>("read_mcp_config", {
        projectRoot: projectRootPath,
      });
      setServers(result);
    } catch (err) {
      toast.error(`Failed to load MCP config: ${err}`);
    }
    setLoading(false);
  }, [projectRootPath]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const saveServers = useCallback(
    async (updatedServers: McpServerEntry[]) => {
      // Group servers by scope
      const userServers: Record<string, McpServerConfig> = {};
      const projectServers: Record<string, McpServerConfig> = {};

      for (const s of updatedServers) {
        const config: McpServerConfig = {
          command: s.command,
          args: s.args,
          env: s.env,
          enabled: s.enabled,
        };
        if (s.scope === "user") {
          userServers[s.name] = config;
        } else {
          projectServers[s.name] = config;
        }
      }

      try {
        // Write user-scope config
        await invoke("write_mcp_config", {
          scope: "user",
          servers: userServers,
          projectRoot: projectRootPath,
        });
        // Write project-scope config if we have a project open
        if (projectRootPath) {
          await invoke("write_mcp_config", {
            scope: "project",
            servers: projectServers,
            projectRoot: projectRootPath,
          });
        }
        setServers(updatedServers);
      } catch (err) {
        toast.error(`Failed to save MCP config: ${err}`);
      }
    },
    [projectRootPath]
  );

  const handleToggle = useCallback(
    (serverName: string) => {
      const updated = servers.map((s) =>
        s.name === serverName ? { ...s, enabled: !s.enabled } : s
      );
      saveServers(updated);
    },
    [servers, saveServers]
  );

  const handleRemove = useCallback(
    (serverName: string) => {
      if (!confirm(`Remove MCP server "${serverName}"?`)) return;
      const updated = servers.filter((s) => s.name !== serverName);
      saveServers(updated);
    },
    [servers, saveServers]
  );

  const handleAdd = useCallback(
    (name: string, config: McpServerConfig, scope: string) => {
      // Check for duplicate names
      if (servers.some((s) => s.name === name && s.scope === scope)) {
        toast.error(`Server "${name}" already exists in ${scope} scope`);
        return;
      }
      const newEntry: McpServerEntry = {
        name,
        ...config,
        scope,
      };
      const updated = [...servers, newEntry];
      saveServers(updated);
      setShowAddDialog(false);
      toast.success(`Added MCP server "${name}"`);
    },
    [servers, saveServers]
  );

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <p className="text-xs">Loading MCP configuration...</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-mantle)",
        }}
      >
        <Server size={14} style={{ color: "var(--color-subtext-0)" }} />
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: "var(--color-text)" }}
        >
          MCP Servers
        </span>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80"
          title="Add MCP server"
          style={{ color: "var(--color-green)" }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
            <Server
              size={24}
              style={{ color: "var(--color-overlay-1)" }}
            />
            <p
              className="text-xs text-center"
              style={{ color: "var(--color-overlay-1)" }}
            >
              No MCP servers configured.
            </p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-3 py-1.5 text-xs rounded hover:bg-[var(--color-surface-1)] transition-colors"
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-text)",
              }}
            >
              Add Server
            </button>
          </div>
        ) : (
          <div className="flex flex-col py-1">
            {servers.map((server) => (
              <div
                key={`${server.scope}-${server.name}`}
                className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-0)] transition-colors"
              >
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(server.name)}
                  className="shrink-0"
                  title={server.enabled ? "Disable" : "Enable"}
                  style={{
                    color: server.enabled
                      ? "var(--color-green)"
                      : "var(--color-overlay-1)",
                  }}
                >
                  {server.enabled ? (
                    <ToggleRight size={16} />
                  ) : (
                    <ToggleLeft size={16} />
                  )}
                </button>

                {/* Server info */}
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-semibold truncate"
                      style={{
                        color: server.enabled
                          ? "var(--color-text)"
                          : "var(--color-overlay-1)",
                      }}
                    >
                      {server.name}
                    </span>
                    <span
                      className="text-[9px] px-1 py-0.5 rounded shrink-0"
                      style={{
                        backgroundColor:
                          server.scope === "user"
                            ? "var(--color-surface-1)"
                            : "color-mix(in srgb, var(--color-blue) 20%, var(--color-surface-0))",
                        color:
                          server.scope === "user"
                            ? "var(--color-subtext-0)"
                            : "var(--color-blue)",
                      }}
                    >
                      {server.scope}
                    </span>
                  </div>
                  <span
                    className="text-[10px] truncate"
                    style={{ color: "var(--color-overlay-1)" }}
                    title={`${server.command} ${server.args.join(" ")}`}
                  >
                    {server.command} {server.args.join(" ")}
                  </span>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleRemove(server.name)}
                  className="flex items-center justify-center w-5 h-5 rounded transition-opacity hover:opacity-80 shrink-0"
                  title="Remove server"
                  style={{ color: "var(--color-red)" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add dialog overlay */}
      {showAddDialog && (
        <AddServerDialog
          onAdd={handleAdd}
          onCancel={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
