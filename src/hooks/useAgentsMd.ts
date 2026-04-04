import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layout";
import {
  parseAgentsMd,
  suggestRole,
  type AgentsMdConfig,
  type AgentRoleDefinition,
} from "@/lib/agentsmd";

interface FileContent {
  path: string;
  content: string;
  language: string;
}

interface UseAgentsMdReturn {
  /** Parsed config, or null if no AGENTS.md exists */
  config: AgentsMdConfig | null;
  /** Whether the hook is still loading */
  loading: boolean;
  /** Suggest a role for a given task description */
  suggest: (taskDescription: string) => AgentRoleDefinition | null;
  /** Reload AGENTS.md from disk */
  reload: () => Promise<void>;
}

/**
 * Loads and parses `AGENTS.md` from the project root via the Rust
 * `read_file` Tauri command. Exposes the parsed config and a
 * `suggest()` function for matching task descriptions to roles.
 *
 * If no AGENTS.md exists in the project root, `config` is `null` and
 * `suggest()` always returns `null`.
 */
export function useAgentsMd(): UseAgentsMdReturn {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const [config, setConfig] = useState<AgentsMdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const configRef = useRef<AgentsMdConfig | null>(null);

  const loadAgentsMd = useCallback(async () => {
    const rootPath = projectRootPath;
    if (!rootPath) {
      setConfig(null);
      configRef.current = null;
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const sep = rootPath.includes("\\") ? "\\" : "/";
      const filePath = `${rootPath}${sep}AGENTS.md`;
      const result = await invoke<FileContent>("read_file", { path: filePath });

      if (result.content) {
        const parsed = parseAgentsMd(result.content);
        setConfig(parsed);
        configRef.current = parsed;
      } else {
        setConfig(null);
        configRef.current = null;
      }
    } catch {
      // File doesn't exist or can't be read -- feature inactive
      setConfig(null);
      configRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [projectRootPath]);

  useEffect(() => {
    loadAgentsMd();
  }, [loadAgentsMd]);

  const suggest = useCallback(
    (taskDescription: string): AgentRoleDefinition | null => {
      if (!configRef.current) return null;
      return suggestRole(taskDescription, configRef.current);
    },
    [],
  );

  return {
    config,
    loading,
    suggest,
    reload: loadAgentsMd,
  };
}
