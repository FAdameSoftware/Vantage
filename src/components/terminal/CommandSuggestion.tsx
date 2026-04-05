import { useState, useEffect, memo } from "react";
import { Lightbulb, X } from "lucide-react";

// ─── Error pattern matching ─────────────────────────────────────────────────

interface SuggestionMatch {
  /** The suggested command to fix the error */
  command: string;
  /** Brief explanation of why this fix is suggested */
  reason: string;
}

/**
 * Pattern-based error detection. Matches common error outputs from
 * shells, npm, git, Python, and other common tools, and suggests
 * the most likely fix command.
 */
function matchErrorPattern(
  failedCommand: string,
  output: string,
): SuggestionMatch | null {
  const lowerOutput = output.toLowerCase();
  const lowerCmd = failedCommand.toLowerCase().trim();

  // ── "command not found" ────────────────────────────────────────────────
  if (
    lowerOutput.includes("command not found") ||
    lowerOutput.includes("is not recognized as") ||
    lowerOutput.includes("not recognized as an internal or external command")
  ) {
    const cmdName = failedCommand.split(/\s+/)[0];
    // Common install suggestions
    const installMap: Record<string, string> = {
      node: "Install Node.js from https://nodejs.org or use nvm",
      npm: "Install Node.js from https://nodejs.org",
      npx: "npm install -g npx",
      yarn: "npm install -g yarn",
      pnpm: "npm install -g pnpm",
      python: "Install Python from https://python.org",
      python3: "Install Python from https://python.org",
      pip: "python -m ensurepip --upgrade",
      pip3: "python3 -m ensurepip --upgrade",
      cargo: "Install Rust from https://rustup.rs",
      rustc: "Install Rust from https://rustup.rs",
      go: "Install Go from https://go.dev/dl",
      git: "Install Git from https://git-scm.com",
      docker: "Install Docker from https://docker.com",
      make: "Install build tools (apt install build-essential / choco install make)",
      cmake: "Install cmake (apt install cmake / choco install cmake)",
    };
    const suggestion = installMap[cmdName];
    if (suggestion) {
      return {
        command: suggestion,
        reason: `"${cmdName}" not found`,
      };
    }
    return {
      command: `# Install "${cmdName}" or check your PATH`,
      reason: `"${cmdName}" not found`,
    };
  }

  // ── Permission denied ──────────────────────────────────────────────────
  if (
    lowerOutput.includes("permission denied") ||
    lowerOutput.includes("eacces")
  ) {
    if (lowerCmd.startsWith("chmod") || lowerCmd.startsWith("chown")) {
      return {
        command: `sudo ${failedCommand}`,
        reason: "Permission denied -- try with elevated privileges",
      };
    }
    // For scripts, suggest making executable
    if (lowerOutput.includes(".sh") || lowerOutput.includes("./")) {
      const scriptMatch = failedCommand.match(/\.\/(\S+)/);
      if (scriptMatch) {
        return {
          command: `chmod +x ${scriptMatch[0]}`,
          reason: "Script not executable",
        };
      }
    }
    return {
      command: `sudo ${failedCommand}`,
      reason: "Permission denied -- try with elevated privileges",
    };
  }

  // ── ENOENT / file not found ────────────────────────────────────────────
  if (
    lowerOutput.includes("enoent") ||
    lowerOutput.includes("no such file or directory")
  ) {
    // If it's an npm script, suggest install
    if (lowerCmd.startsWith("npm") || lowerCmd.startsWith("npx")) {
      return {
        command: "npm install",
        reason: "Missing dependencies -- try installing them",
      };
    }
    return {
      command: "ls -la",
      reason: "File or directory not found -- check the path",
    };
  }

  // ── npm errors ─────────────────────────────────────────────────────────
  if (
    lowerOutput.includes("npm err!") ||
    lowerOutput.includes("npm error")
  ) {
    if (
      lowerOutput.includes("missing script") ||
      lowerOutput.includes("missing: ") ||
      lowerOutput.includes("could not determine executable to run")
    ) {
      return {
        command: "npm install",
        reason: "Missing npm packages or scripts",
      };
    }
    if (lowerOutput.includes("eresolve") || lowerOutput.includes("peer dep")) {
      return {
        command: "npm install --legacy-peer-deps",
        reason: "Dependency resolution conflict",
      };
    }
    if (lowerOutput.includes("enolock") || lowerOutput.includes("package-lock")) {
      return {
        command: "npm install",
        reason: "Missing or outdated package-lock.json",
      };
    }
    // General npm error
    return {
      command: "npm install",
      reason: "npm error -- try reinstalling dependencies",
    };
  }

  // ── Module not found / import errors ───────────────────────────────────
  if (
    lowerOutput.includes("module not found") ||
    lowerOutput.includes("cannot find module") ||
    lowerOutput.includes("modulenotfounderror")
  ) {
    if (lowerCmd.startsWith("python") || lowerCmd.startsWith("pip")) {
      const moduleMatch = output.match(/No module named '([^']+)'/);
      if (moduleMatch) {
        return {
          command: `pip install ${moduleMatch[1]}`,
          reason: `Python module "${moduleMatch[1]}" not installed`,
        };
      }
    }
    return {
      command: "npm install",
      reason: "Missing module -- try installing dependencies",
    };
  }

  // ── TypeScript / build errors ──────────────────────────────────────────
  if (
    lowerOutput.includes("ts error") ||
    lowerOutput.includes("type error") ||
    lowerOutput.includes("syntaxerror")
  ) {
    if (lowerCmd.includes("tsc")) {
      return {
        command: "npx tsc --noEmit 2>&1 | head -20",
        reason: "TypeScript errors -- review the first few",
      };
    }
  }

  // ── Git errors ─────────────────────────────────────────────────────────
  if (lowerCmd.startsWith("git")) {
    if (lowerOutput.includes("not a git repository")) {
      return {
        command: "git init",
        reason: "Not a git repository",
      };
    }
    if (
      lowerOutput.includes("your local changes would be overwritten") ||
      lowerOutput.includes("please commit your changes or stash them")
    ) {
      return {
        command: "git stash",
        reason: "Uncommitted changes blocking operation -- stash them first",
      };
    }
    if (lowerOutput.includes("merge conflict") || lowerOutput.includes("conflict")) {
      return {
        command: "git status",
        reason: "Merge conflict -- check status and resolve",
      };
    }
    if (lowerOutput.includes("failed to push")) {
      return {
        command: "git pull --rebase",
        reason: "Remote has changes -- pull before pushing",
      };
    }
    if (lowerOutput.includes("detached head")) {
      return {
        command: "git checkout main",
        reason: "Detached HEAD state -- switch to a branch",
      };
    }
    if (lowerOutput.includes("does not exist") || lowerOutput.includes("did not match")) {
      return {
        command: "git branch -a",
        reason: "Branch or ref not found -- list available branches",
      };
    }
  }

  // ── Port already in use ────────────────────────────────────────────────
  if (
    lowerOutput.includes("eaddrinuse") ||
    lowerOutput.includes("address already in use")
  ) {
    const portMatch = output.match(/port\s+(\d+)/i) ?? output.match(/:(\d+)/);
    const port = portMatch ? portMatch[1] : "3000";
    return {
      command: `npx kill-port ${port}`,
      reason: `Port ${port} is already in use`,
    };
  }

  // ── Cargo / Rust errors ────────────────────────────────────────────────
  if (lowerCmd.startsWith("cargo")) {
    if (lowerOutput.includes("could not compile")) {
      return {
        command: "cargo check 2>&1 | head -30",
        reason: "Compilation errors -- review details",
      };
    }
    if (lowerOutput.includes("no such subcommand")) {
      return {
        command: "cargo --list",
        reason: "Unknown cargo subcommand -- list available commands",
      };
    }
  }

  // ── Docker errors ──────────────────────────────────────────────────────
  if (lowerCmd.startsWith("docker")) {
    if (lowerOutput.includes("daemon is not running") || lowerOutput.includes("cannot connect")) {
      return {
        command: "# Start Docker Desktop or: sudo systemctl start docker",
        reason: "Docker daemon not running",
      };
    }
  }

  // No match found
  return null;
}

// ─── CommandSuggestion component ────────────────────────────────────────────

export interface CommandSuggestionProps {
  /** The command that failed */
  failedCommand: string;
  /** Exit code of the failed command */
  exitCode: number;
  /** Last N lines of terminal output (for pattern matching) */
  recentOutput: string;
  /** Called when user accepts the suggestion (Tab) */
  onAccept: (command: string) => void;
  /** Called when user dismisses the suggestion (Escape) */
  onDismiss: () => void;
}

export const CommandSuggestion = memo(function CommandSuggestion({
  failedCommand,
  exitCode,
  recentOutput,
  onAccept,
  onDismiss,
}: CommandSuggestionProps) {
  const [suggestion, setSuggestion] = useState<SuggestionMatch | null>(null);

  useEffect(() => {
    if (exitCode === 0) {
      setSuggestion(null);
      return;
    }
    const match = matchErrorPattern(failedCommand, recentOutput);
    setSuggestion(match);
  }, [failedCommand, exitCode, recentOutput]);

  // Keyboard handler: Tab to accept, Escape to dismiss
  useEffect(() => {
    if (!suggestion) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && suggestion) {
        e.preventDefault();
        e.stopPropagation();
        // Don't send comments as commands
        if (!suggestion.command.startsWith("#")) {
          onAccept(suggestion.command);
        }
        setSuggestion(null);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
        setSuggestion(null);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [suggestion, onAccept, onDismiss]);

  if (!suggestion) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-yellow) 8%, var(--color-surface-0))",
        borderTop: "1px solid var(--color-surface-1)",
      }}
      role="status"
      aria-live="polite"
    >
      <Lightbulb
        size={12}
        className="shrink-0"
        style={{ color: "var(--color-yellow)" }}
      />

      {/* Suggestion text */}
      <div className="flex-1 min-w-0">
        <span
          className="font-medium"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-text)",
          }}
        >
          {suggestion.command}
        </span>
        <span
          className="ml-2"
          style={{ color: "var(--color-overlay-1)" }}
        >
          {suggestion.reason}
        </span>
      </div>

      {/* Keyboard hints */}
      <div className="flex items-center gap-2 shrink-0">
        {!suggestion.command.startsWith("#") && (
          <span
            className="flex items-center gap-1"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <kbd
              className="px-1 py-0.5 rounded text-[9px] font-mono"
              style={{
                backgroundColor: "var(--color-surface-1)",
                color: "var(--color-text)",
                border: "1px solid var(--color-surface-1)",
              }}
            >
              Tab
            </kbd>
            <span className="text-[9px]">accept</span>
          </span>
        )}
        <button
          type="button"
          className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={() => {
            onDismiss();
            setSuggestion(null);
          }}
          aria-label="Dismiss suggestion"
          title="Dismiss (Escape)"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
});

// ─── Export the matcher for testing ─────────────────────────────────────────

export { matchErrorPattern };
export type { SuggestionMatch };
