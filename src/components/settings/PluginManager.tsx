import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Puzzle,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Wand2,
  Terminal,
  Server,
  GitBranch,
  Bot,
} from "lucide-react";
import { toast } from "sonner";

// ── Types (mirroring Rust structs) ─────────────────────────────────

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  path: string;
  enabled: boolean;
  skills: string[];
  commands: string[];
  hooks: string[];
  mcpServers: string[];
  agents: string[];
}

interface SkillInfo {
  name: string;
  description: string;
  whenToUse: string;
  source: string;
  userInvocable: boolean;
  argumentHint: string | null;
  path: string;
}

// ── Tag component ──────────────────────────────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px]"
      style={{
        backgroundColor: "var(--color-surface-1)",
        color: "var(--color-overlay-1)",
      }}
    >
      {label}
    </span>
  );
}

// ── Plugin subsection ──────────────────────────────────────────────

function SubSection({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-center gap-1"
        style={{ color: "var(--color-subtext-0)" }}
      >
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1 pl-4">
        {items.map((item) => (
          <Tag key={item} label={item} />
        ))}
      </div>
    </div>
  );
}

// ── Plugin card ────────────────────────────────────────────────────

function PluginCard({
  plugin,
  expanded,
  onExpand,
  onToggle,
}: {
  plugin: PluginInfo;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
}) {
  const hasDetails =
    plugin.skills.length > 0 ||
    plugin.commands.length > 0 ||
    plugin.hooks.length > 0 ||
    plugin.mcpServers.length > 0 ||
    plugin.agents.length > 0;

  return (
    <div
      className="flex flex-col"
      style={{ borderBottom: "1px solid var(--color-surface-0)" }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-0)] transition-colors">
        {/* Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0"
          title={plugin.enabled ? "Disable plugin" : "Enable plugin"}
          style={{
            color: plugin.enabled
              ? "var(--color-green)"
              : "var(--color-overlay-1)",
          }}
        >
          {plugin.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
        </button>

        {/* Info */}
        <div
          className="flex flex-col flex-1 min-w-0 cursor-pointer"
          onClick={onExpand}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-semibold truncate"
              style={{
                color: plugin.enabled
                  ? "var(--color-text)"
                  : "var(--color-overlay-1)",
              }}
            >
              {plugin.name}
            </span>
            {plugin.version && (
              <span
                className="text-[9px] px-1 py-0.5 rounded shrink-0"
                style={{
                  backgroundColor: "var(--color-surface-1)",
                  color: "var(--color-subtext-0)",
                }}
              >
                v{plugin.version}
              </span>
            )}
          </div>
          {plugin.description && (
            <span
              className="text-[10px] truncate"
              style={{ color: "var(--color-overlay-1)" }}
              title={plugin.description}
            >
              {plugin.description}
            </span>
          )}
          {plugin.author && (
            <span
              className="text-[10px]"
              style={{ color: "var(--color-overlay-1)" }}
            >
              by {plugin.author}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        {hasDetails && (
          <button
            onClick={onExpand}
            className="shrink-0"
            title={expanded ? "Collapse" : "Expand"}
            style={{ color: "var(--color-overlay-1)" }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div
          className="flex flex-col gap-2 px-4 pb-3 pt-1"
          style={{ backgroundColor: "var(--color-mantle)" }}
        >
          <SubSection
            icon={<Wand2 size={10} />}
            label="Skills"
            items={plugin.skills}
          />
          <SubSection
            icon={<Terminal size={10} />}
            label="Commands"
            items={plugin.commands}
          />
          <SubSection
            icon={<GitBranch size={10} />}
            label="Hooks"
            items={plugin.hooks}
          />
          <SubSection
            icon={<Server size={10} />}
            label="MCP Servers"
            items={plugin.mcpServers}
          />
          <SubSection
            icon={<Bot size={10} />}
            label="Agents"
            items={plugin.agents}
          />
        </div>
      )}
    </div>
  );
}

// ── Main PluginManager component ───────────────────────────────────

export function PluginManager() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [pluginList, skillList] = await Promise.all([
        invoke<PluginInfo[]>("list_installed_plugins"),
        invoke<SkillInfo[]>("list_installed_skills"),
      ]);
      setPlugins(pluginList);
      setSkills(skillList);
    } catch (err) {
      toast.error(`Failed to load plugins: ${err}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = useCallback(
    async (pluginName: string, currentEnabled: boolean) => {
      try {
        await invoke("toggle_plugin", {
          pluginName,
          enabled: !currentEnabled,
        });
        // Reload plugin list to reflect new state
        const updated = await invoke<PluginInfo[]>("list_installed_plugins");
        setPlugins(updated);
        toast.success(
          `Plugin "${pluginName}" ${!currentEnabled ? "enabled" : "disabled"}`
        );
      } catch (err) {
        toast.error(`Failed to toggle plugin: ${err}`);
      }
    },
    []
  );

  const handleExpand = useCallback((pluginName: string) => {
    setExpandedPlugin((prev) => (prev === pluginName ? null : pluginName));
  }, []);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--color-overlay-1)" }}
      >
        <p className="text-xs">Loading plugins...</p>
      </div>
    );
  }

  const userSkills = skills.filter((s) => s.source === "user");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-mantle)",
        }}
      >
        <Puzzle size={14} style={{ color: "var(--color-subtext-0)" }} />
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: "var(--color-text)" }}
        >
          Installed Plugins
        </span>
        {plugins.length > 0 && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--color-surface-1)",
              color: "var(--color-subtext-0)",
            }}
          >
            {plugins.length}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Plugin list */}
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 gap-2">
            <Puzzle size={24} style={{ color: "var(--color-overlay-1)" }} />
            <p
              className="text-xs text-center"
              style={{ color: "var(--color-overlay-1)" }}
            >
              No plugins installed.
            </p>
            <p
              className="text-[10px] text-center"
              style={{ color: "var(--color-overlay-2)" }}
            >
              Install plugins with{" "}
              <code
                className="px-1 py-0.5 rounded"
                style={{ backgroundColor: "var(--color-surface-1)" }}
              >
                claude plugins add &lt;name&gt;
              </code>
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {plugins.map((plugin) => (
              <PluginCard
                key={plugin.name}
                plugin={plugin}
                expanded={expandedPlugin === plugin.name}
                onExpand={() => handleExpand(plugin.name)}
                onToggle={() => handleToggle(plugin.name, plugin.enabled)}
              />
            ))}
          </div>
        )}

        {/* User skills section */}
        {userSkills.length > 0 && (
          <div className="flex flex-col">
            <div
              className="flex items-center gap-2 px-3 h-8 shrink-0"
              style={{
                borderBottom: "1px solid var(--color-surface-0)",
                borderTop: "1px solid var(--color-surface-0)",
                backgroundColor: "var(--color-mantle)",
              }}
            >
              <Wand2 size={12} style={{ color: "var(--color-subtext-0)" }} />
              <span
                className="text-xs font-semibold flex-1"
                style={{ color: "var(--color-text)" }}
              >
                User Skills
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--color-surface-1)",
                  color: "var(--color-subtext-0)",
                }}
              >
                {userSkills.length}
              </span>
            </div>
            <div className="flex flex-col py-1">
              {userSkills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex flex-col gap-0.5 px-3 py-2 hover:bg-[var(--color-surface-0)] transition-colors"
                >
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    {skill.name}
                  </span>
                  {skill.description && (
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--color-overlay-1)" }}
                    >
                      {skill.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
