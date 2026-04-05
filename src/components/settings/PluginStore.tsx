import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Download,
  ExternalLink,
  Package,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { searchPluginRegistry, type RegistryPlugin } from "@/lib/pluginRegistry";
import { toast } from "sonner";

// ── Props ──────────────────────────────────────────────────────────

interface PluginStoreProps {
  /** Names of already-installed plugins, for showing "Installed" badge */
  installedPluginNames: string[];
  /** Callback to close the store and go back to the plugin list */
  onBack: () => void;
}

// ── Plugin card ────────────────────────────────────────────────────

function StorePluginCard({
  plugin,
  isInstalled,
  onInstalled,
}: {
  plugin: RegistryPlugin;
  isInstalled: boolean;
  onInstalled: () => void;
}) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await invoke<string>("install_plugin", { name: plugin.name });
      toast.success(`Installed ${plugin.name}`);
      onInstalled();
    } catch (err) {
      toast.error(`Failed to install ${plugin.name}: ${String(err)}`);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-1.5 p-2.5 rounded transition-colors"
      style={{
        backgroundColor: "var(--color-surface-0)",
        border: "1px solid var(--color-surface-1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          "var(--color-surface-1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          "var(--color-surface-0)";
      }}
    >
      {/* Name row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <a
          href={plugin.npmUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold flex items-center gap-0.5 hover:underline"
          style={{ color: "var(--color-blue)" }}
          title={`Open ${plugin.name} on npm`}
        >
          {plugin.name}
          <ExternalLink size={9} />
        </a>

        {plugin.version && (
          <span
            className="text-[9px] px-1 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: "var(--color-mantle)",
              color: "var(--color-subtext-0)",
            }}
          >
            v{plugin.version}
          </span>
        )}

        {isInstalled && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded ml-auto shrink-0"
            style={{
              backgroundColor: "var(--color-green)",
              color: "var(--color-base)",
            }}
          >
            Installed
          </span>
        )}
      </div>

      {/* Description */}
      {plugin.description && (
        <p
          className="text-[10px] line-clamp-2"
          style={{ color: "var(--color-overlay-1)" }}
          title={plugin.description}
        >
          {plugin.description}
        </p>
      )}

      {/* Footer: author, downloads, install */}
      <div className="flex items-center gap-2 mt-0.5">
        {plugin.author && (
          <span
            className="text-[10px] flex-1 truncate"
            style={{ color: "var(--color-overlay-1)" }}
          >
            by {plugin.author}
          </span>
        )}

        {plugin.downloads > 0 && (
          <span
            className="flex items-center gap-0.5 text-[10px] shrink-0"
            style={{ color: "var(--color-subtext-0)" }}
            title="Weekly downloads"
          >
            <Download size={9} />
            {plugin.downloads.toLocaleString()}
          </span>
        )}

        {!isInstalled && (
          <button
            onClick={() => void handleInstall()}
            disabled={installing}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] transition-opacity hover:opacity-80 shrink-0 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-blue)",
              color: "var(--color-base)",
            }}
            title={`Install ${plugin.name}`}
          >
            {installing ? (
              <Loader2 size={9} className="animate-spin" />
            ) : (
              <Download size={9} />
            )}
            {installing ? "Installing..." : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main PluginStore component ─────────────────────────────────────

export function PluginStore({ installedPluginNames, onBack }: PluginStoreProps) {
  const [plugins, setPlugins] = useState<RegistryPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [localInstalledNames, setLocalInstalledNames] = useState(installedPluginNames);

  // Refresh installed list from backend after an install
  const refreshInstalledNames = useCallback(async () => {
    try {
      const list = await invoke<{ name: string }[]>("list_installed_plugins");
      setLocalInstalledNames(list.map((p) => p.name));
    } catch {
      // Keep current list on error
    }
  }, []);

  // Debounce search query by 300 ms
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchPluginRegistry(debouncedQuery, page * 20);
      setPlugins(result.plugins);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugins");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page]);

  useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const showingStart = total === 0 ? 0 : page * 20 + 1;
  const showingEnd = Math.min(page * 20 + plugins.length, total);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
          backgroundColor: "var(--color-mantle)",
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-[10px] transition-colors hover:opacity-80"
          style={{ color: "var(--color-subtext-0)" }}
          title="Back to installed plugins"
        >
          <ChevronLeft size={12} />
          Back
        </button>
        <Package size={13} style={{ color: "var(--color-subtext-0)" }} />
        <span
          className="text-xs font-semibold flex-1"
          style={{ color: "var(--color-text)" }}
        >
          Plugin Store
        </span>
      </div>

      {/* Search bar */}
      <div
        className="px-2 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <Search size={11} style={{ color: "var(--color-overlay-1)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Claude Code plugins..."
            className="flex-1 bg-transparent outline-none text-[10px]"
            style={{ color: "var(--color-text)" }}
            aria-label="Search plugins"
          />
        </div>
      </div>

      {/* Results count */}
      {!loading && !error && (
        <div
          className="px-2 py-1 shrink-0 text-[10px]"
          style={{ color: "var(--color-overlay-1)" }}
        >
          {total === 0
            ? "No plugins found"
            : `Showing ${showingStart}–${showingEnd} of ${total} plugins`}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2
              size={18}
              className="animate-spin"
              style={{ color: "var(--color-overlay-1)" }}
            />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
            <p
              className="text-[10px] text-center"
              style={{ color: "var(--color-red)" }}
            >
              {error}
            </p>
            <button
              onClick={() => void fetchPlugins()}
              className="text-[10px] px-2 py-1 rounded transition-opacity hover:opacity-80"
              style={{
                backgroundColor: "var(--color-surface-1)",
                color: "var(--color-text)",
              }}
            >
              Retry
            </button>
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 px-4">
            <Package size={22} style={{ color: "var(--color-overlay-1)" }} />
            <p
              className="text-[10px] text-center"
              style={{ color: "var(--color-overlay-1)" }}
            >
              {debouncedQuery
                ? `No plugins found for "${debouncedQuery}"`
                : "No plugins found"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mt-1">
            {plugins.map((plugin) => (
              <StorePluginCard
                key={plugin.name}
                plugin={plugin}
                isInstalled={localInstalledNames.includes(plugin.name)}
                onInstalled={() => void refreshInstalledNames()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && total > 20 && (
        <div
          className="flex items-center justify-between px-2 py-1.5 shrink-0 text-[10px]"
          style={{
            borderTop: "1px solid var(--color-surface-0)",
            color: "var(--color-subtext-0)",
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-opacity disabled:opacity-40 hover:opacity-80"
            style={{ backgroundColor: "var(--color-surface-1)" }}
            aria-label="Previous page"
          >
            <ChevronLeft size={10} />
            Prev
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-opacity disabled:opacity-40 hover:opacity-80"
            style={{ backgroundColor: "var(--color-surface-1)" }}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={10} />
          </button>
        </div>
      )}
    </div>
  );
}
