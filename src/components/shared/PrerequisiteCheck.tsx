import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";

interface PrerequisiteResult {
  name: string;
  passed: boolean;
  version: string | null;
  message: string;
  install_hint: string | null;
  severity: string;
}

export function PrerequisiteCheck() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<PrerequisiteResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await invoke<PrerequisiteResult[]>("check_prerequisites");
      setResults(res);
    } catch (e) {
      console.error("Prerequisite check failed:", e);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const store = await Store.load("prerequisites.json");
        const hasPassed = await store.get<boolean>("hasPassedChecks");
        if (hasPassed) return;
      } catch {
        // Store doesn't exist yet, show dialog
      }
      setIsOpen(true);
      runChecks();
    };
    init();
  }, [runChecks]);

  const hasErrors = results.some((r) => !r.passed && r.severity === "error");
  const allPassed = results.length > 0 && results.every((r) => r.passed);

  const handleContinue = async () => {
    try {
      const store = await Store.load("prerequisites.json");
      await store.set("hasPassedChecks", true);
      await store.save();
    } catch {
      // Best effort
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
        style={{
          backgroundColor: "var(--color-base)",
          border: "1px solid var(--color-surface-1)",
          color: "var(--color-text)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--color-text)" }}>
            Welcome to Vantage
          </DialogTitle>
          <DialogDescription style={{ color: "var(--color-subtext-0)" }}>
            {allPassed
              ? "All prerequisites are met."
              : "Checking system prerequisites..."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 my-4">
          {results.map((result) => (
            <div key={result.name} className="flex items-start gap-3">
              {result.passed ? (
                <CheckCircle2
                  size={18}
                  style={{ color: "var(--color-green)" }}
                  className="shrink-0 mt-0.5"
                />
              ) : result.severity === "error" ? (
                <XCircle
                  size={18}
                  style={{ color: "var(--color-red)" }}
                  className="shrink-0 mt-0.5"
                />
              ) : (
                <AlertTriangle
                  size={18}
                  style={{ color: "var(--color-yellow)" }}
                  className="shrink-0 mt-0.5"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{result.name}</span>
                  {result.version && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-overlay-1)" }}
                    >
                      {result.version}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--color-subtext-0)" }}
                >
                  {result.message}
                </p>
                {!result.passed && result.install_hint && (
                  <code
                    className="block mt-1 px-2 py-1 rounded text-xs font-mono break-all"
                    style={{
                      backgroundColor: "var(--color-surface-0)",
                      color: "var(--color-peach)",
                    }}
                  >
                    {result.install_hint}
                  </code>
                )}
              </div>
            </div>
          ))}

          {isChecking && results.length === 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2
                size={24}
                className="animate-spin"
                style={{ color: "var(--color-blue)" }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={runChecks}
            disabled={isChecking}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
              cursor: isChecking ? "not-allowed" : "pointer",
              opacity: isChecking ? 0.6 : 1,
            }}
          >
            <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />
            Check Again
          </button>
          <button
            onClick={handleContinue}
            disabled={hasErrors}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: hasErrors
                ? "var(--color-surface-1)"
                : "var(--color-blue)",
              color: hasErrors
                ? "var(--color-overlay-1)"
                : "var(--color-crust)",
              cursor: hasErrors ? "not-allowed" : "pointer",
            }}
          >
            {hasErrors ? "Fix required items to continue" : "Continue"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
