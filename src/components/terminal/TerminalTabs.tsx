import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Terminal as TerminalIcon,
  Plus,
  X,
  Maximize2,
  Columns2,
  Trash2,
} from "lucide-react";
import { useLayoutStore } from "@/stores/layout";
import { TerminalInstance } from "./TerminalInstance";

interface ShellInfo {
  name: string;
  path: string;
  args: string[];
  is_default: boolean;
}

interface TerminalTab {
  id: string;
  label: string;
  shellName: string;
  shellPath: string;
  shellArgs: string[];
  cwd?: string;
}

let nextTerminalId = 1;

export function TerminalPanel() {
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [showShellPicker, setShowShellPicker] = useState(false);
  /** ID of the terminal shown in the right split pane (null = no split) */
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  /** ID of the terminal tab currently being renamed (null = none) */
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  /** Map of terminal tab ID -> clear function registered by TerminalInstance */
  const clearFnsRef = useRef<Map<string, () => void>>(new Map());

  const createTerminal = useCallback(
    (shell: ShellInfo, cwd?: string) => {
      const id = `term-${nextTerminalId++}`;
      const newTab: TerminalTab = {
        id,
        label: `Terminal ${nextTerminalId - 1}`,
        shellName: shell.name,
        shellPath: shell.path,
        shellArgs: shell.args,
        cwd,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
      setShowShellPicker(false);
    },
    []
  );

  // Fetch available shells on mount
  useEffect(() => {
    invoke<ShellInfo[]>("list_shells")
      .then((shellList) => {
        setShells(shellList);
        // Create initial terminal with default shell
        if (shellList.length > 0) {
          const defaultShell =
            shellList.find((s) => s.is_default) ?? shellList[0];
          createTerminal(defaultShell);
        }
      })
      .catch((err) => {
        console.error("Failed to list shells:", err);
        // Fallback: create a PowerShell terminal
        createTerminal({
          name: "PowerShell",
          path: "powershell.exe",
          args: ["-NoLogo"],
          is_default: true,
        });
      });
  }, [createTerminal]);

  const closeTerminal = useCallback(
    (id: string) => {
      // If closing the split terminal, just unsplit
      if (splitTabId === id) {
        setSplitTabId(null);
      }
      // Clean up the stored clear function
      clearFnsRef.current.delete(id);
      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== id);
        if (activeTabId === id && newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
          setSplitTabId(null);
        }
        return newTabs;
      });
    },
    [activeTabId, splitTabId]
  );

  const startRenaming = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.label);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, [tabs]);

  const confirmRename = useCallback(() => {
    if (renamingTabId && renameValue.trim()) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === renamingTabId ? { ...t, label: renameValue.trim() } : t,
        ),
      );
    }
    setRenamingTabId(null);
    setRenameValue("");
  }, [renamingTabId, renameValue]);

  const cancelRename = useCallback(() => {
    setRenamingTabId(null);
    setRenameValue("");
  }, []);

  const handleNewTerminal = useCallback(() => {
    if (shells.length > 1) {
      setShowShellPicker((prev) => !prev);
    } else if (shells.length === 1) {
      createTerminal(shells[0]);
    }
  }, [shells, createTerminal]);

  /** Register a clear function for a terminal tab (called by TerminalInstance on mount) */
  const handleRegisterClear = useCallback((tabId: string, clearFn: () => void) => {
    clearFnsRef.current.set(tabId, clearFn);
  }, []);

  /** Clear the active terminal's buffer */
  const handleClearTerminal = useCallback(() => {
    if (!activeTabId) return;
    clearFnsRef.current.get(activeTabId)?.();
  }, [activeTabId]);

  /** Split: create a new terminal and show it side-by-side with the active one */
  const handleSplitTerminal = useCallback(() => {
    if (!activeTabId) return;
    const defaultShell = shells.find((s) => s.is_default) ?? shells[0];
    if (!defaultShell) return;
    const id = `term-${nextTerminalId++}`;
    const newTab: TerminalTab = {
      id,
      label: `Terminal ${nextTerminalId - 1}`,
      shellName: defaultShell.name,
      shellPath: defaultShell.path,
      shellArgs: defaultShell.args,
    };
    setTabs((prev) => [...prev, newTab]);
    setSplitTabId(id);
  }, [activeTabId, shells]);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: "var(--color-base)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between h-7 shrink-0 px-1"
        style={{ backgroundColor: "var(--color-mantle)" }}
      >
        {/* Tabs — role="tablist" must only contain role="tab" children */}
        <div className="flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1 px-2 h-6 text-[11px] rounded-t cursor-pointer transition-colors group shrink-0"
              style={{
                backgroundColor:
                  tab.id === activeTabId
                    ? "var(--color-base)"
                    : "transparent",
                color:
                  tab.id === activeTabId
                    ? "var(--color-text)"
                    : "var(--color-subtext-0)",
              }}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => setActiveTabId(tab.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRenaming(tab.id);
              }}
            >
              <TerminalIcon size={12} />
              {renamingTabId === tab.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                    e.stopPropagation();
                  }}
                  onBlur={confirmRename}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent text-[11px] outline-none rounded px-0.5"
                  style={{
                    color: "var(--color-text)",
                    border: "1px solid var(--color-blue)",
                    width: `${Math.max(renameValue.length * 6.5, 40)}px`,
                    maxWidth: "120px",
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
              ) : (
                <span>{tab.label}</span>
              )}
              {renamingTabId !== tab.id && (
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--color-overlay-0)" }}
                >
                  ({tab.shellName})
                </span>
              )}
              {/* aria-roledescription tells AT this is a closeable tab; the
                  button is visually hidden until hover to reduce clutter */}
              <button
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-1)] transition-all ml-1"
                style={{ color: "var(--color-overlay-1)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(tab.id);
                }}
                aria-label={`Close ${tab.label}`}
                tabIndex={-1}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>

        {/* New terminal button — lives outside the tablist to satisfy
            aria-required-children (tablist must only own tab children) */}
        <div className="relative">
          <button
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={handleNewTerminal}
            aria-label="New Terminal"
            title="New Terminal (Ctrl+Shift+`)"
          >
            <Plus size={14} />
          </button>

          {/* Shell picker dropdown */}
          {showShellPicker && (
            <div
              className="absolute top-full left-0 mt-1 rounded-md shadow-lg py-1 z-50 min-w-[160px]"
              style={{
                backgroundColor: "var(--color-surface-0)",
                border: "1px solid var(--color-surface-1)",
              }}
            >
              {shells.map((shell) => (
                <button
                  key={shell.path}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[var(--color-surface-1)] transition-colors"
                  style={{ color: "var(--color-text)" }}
                  onClick={() => createTerminal(shell)}
                >
                  <TerminalIcon size={12} />
                  <span>{shell.name}</span>
                  {shell.is_default && (
                    <span
                      className="text-xs ml-auto"
                      style={{ color: "var(--color-overlay-0)" }}
                    >
                      default
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel actions */}
        <div className="flex items-center gap-0.5">
          <button
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={handleClearTerminal}
            aria-label="Clear Terminal"
            title="Clear Terminal"
            disabled={!activeTabId}
          >
            <Trash2 size={12} />
          </button>
          <button
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{
              color: splitTabId ? "var(--color-blue)" : "var(--color-overlay-1)",
            }}
            onClick={handleSplitTerminal}
            aria-label="Split Terminal"
            title="Split Terminal"
          >
            <Columns2 size={12} />
          </button>
          <button
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="Maximize Panel"
            title="Maximize Panel"
          >
            <Maximize2 size={12} />
          </button>
          <button
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={togglePanel}
            aria-label="Close Panel (Ctrl+J)"
            title="Close Panel (Ctrl+J)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Close shell picker when clicking outside */}
      {showShellPicker && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowShellPicker(false)}
        />
      )}

      {/* Terminal instances */}
      <div className="flex-1 overflow-hidden flex">
        {tabs.length === 0 ? (
          <div
            className="flex items-center justify-center h-full w-full text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            No terminals open. Click + to create one.
          </div>
        ) : splitTabId ? (
          /* Split view: two terminals side by side */
          <>
            <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
              {tabs.map((tab) => (
                <TerminalInstance
                  key={tab.id}
                  shellPath={tab.shellPath}
                  shellArgs={tab.shellArgs}
                  cwd={tab.cwd}
                  isVisible={tab.id === activeTabId}
                  onRegisterClear={(fn) => handleRegisterClear(tab.id, fn)}
                />
              ))}
            </div>
            <div
              className="w-px shrink-0"
              style={{ backgroundColor: "var(--color-surface-1)" }}
            />
            <div className="flex-1 overflow-hidden" style={{ minWidth: 0 }}>
              {tabs.map((tab) => (
                <TerminalInstance
                  key={`split-${tab.id}`}
                  shellPath={tab.shellPath}
                  shellArgs={tab.shellArgs}
                  cwd={tab.cwd}
                  isVisible={tab.id === splitTabId}
                  onRegisterClear={(fn) => handleRegisterClear(tab.id, fn)}
                />
              ))}
            </div>
          </>
        ) : (
          /* Single view */
          tabs.map((tab) => (
            <TerminalInstance
              key={tab.id}
              shellPath={tab.shellPath}
              shellArgs={tab.shellArgs}
              cwd={tab.cwd}
              isVisible={tab.id === activeTabId}
              onRegisterClear={(fn) => handleRegisterClear(tab.id, fn)}
            />
          ))
        )}
      </div>
    </div>
  );
}
