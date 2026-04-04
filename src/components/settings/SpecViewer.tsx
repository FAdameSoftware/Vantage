import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Copy,
  Bot,
  FileText,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { useLayoutStore } from "@/stores/layout";
import { useAgentsStore } from "@/stores/agents";
import { shardDocument, type DocumentSection, type ShardedDocument } from "@/lib/bmadSharding";
import "../editor/markdownPreview.css";

// ── Types ─────────────────────────────────────────────────────────────

interface FileContent {
  path: string;
  content: string;
  language: string;
}

interface FileNode {
  name: string;
  path: string;
  is_file: boolean;
  extension: string | null;
  children?: FileNode[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k t`;
  return `${n} t`;
}

function collectMdFiles(nodes: FileNode[], result: FileNode[] = []): FileNode[] {
  for (const node of nodes) {
    if (node.is_file && node.extension?.toLowerCase() === "md") {
      result.push(node);
    }
    if (node.children) {
      collectMdFiles(node.children, result);
    }
  }
  return result;
}

// ── TocNode component ─────────────────────────────────────────────────

interface TocNodeProps {
  section: DocumentSection;
  allSections: DocumentSection[];
  depth: number;
  selectedId: number | null;
  expandedIds: Set<number>;
  checkedIds: Set<number>;
  onSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onToggleCheck: (id: number) => void;
}

function TocNode({
  section,
  allSections,
  depth,
  selectedId,
  expandedIds,
  checkedIds,
  onSelect,
  onToggleExpand,
  onToggleCheck,
}: TocNodeProps) {
  const hasChildren = section.childIds.length > 0;
  const isExpanded = expandedIds.has(section.id);
  const isSelected = selectedId === section.id;
  const isChecked = checkedIds.has(section.id);

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer select-none group transition-colors rounded-sm"
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          backgroundColor: isSelected ? "var(--color-surface-1)" : "transparent",
          color: isSelected ? "var(--color-text)" : "var(--color-subtext-1)",
        }}
        onClick={() => onSelect(section.id)}
      >
        {/* Expand chevron */}
        <button
          className="flex items-center justify-center w-4 h-4 shrink-0 transition-transform"
          style={{
            color: "var(--color-overlay-0)",
            visibility: hasChildren ? "visible" : "hidden",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(section.id);
          }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Checkbox */}
        <input
          type="checkbox"
          className="shrink-0 cursor-pointer accent-[var(--color-blue)]"
          checked={isChecked}
          onChange={(e) => {
            e.stopPropagation();
            onToggleCheck(section.id);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 12, height: 12 }}
        />

        {/* Title + token count */}
        <span
          className="flex-1 text-xs truncate ml-1"
          style={{ fontWeight: depth === 0 ? 600 : 400 }}
        >
          {section.title}
        </span>
        <span
          className="text-xs shrink-0 ml-1 opacity-60"
          style={{ color: "var(--color-overlay-0)", fontSize: "0.65rem" }}
        >
          {formatTokens(section.estimatedTokens)}
        </span>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {section.childIds.map((childId) => {
            const child = allSections.find((s) => s.id === childId);
            if (!child) return null;
            return (
              <TocNode
                key={child.id}
                section={child}
                allSections={allSections}
                depth={depth + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                checkedIds={checkedIds}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                onToggleCheck={onToggleCheck}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main SpecViewer component ─────────────────────────────────────────

export function SpecViewer() {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const createAgent = useAgentsStore((s) => s.createAgent);

  const [mdFiles, setMdFiles] = useState<FileNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>("");
  const [document, setDocument] = useState<ShardedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ToC state
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // ── Discover .md files ──────────────────────────────────────────────
  useEffect(() => {
    if (!projectRootPath) {
      setMdFiles([]);
      return;
    }

    invoke<FileNode[]>("get_file_tree", { path: projectRootPath, depth: 6 })
      .then((tree) => {
        const files = collectMdFiles(tree);
        setMdFiles(files);
        if (files.length > 0 && !selectedFilePath) {
          setSelectedFilePath(files[0].path);
        }
      })
      .catch((err) => {
        console.error("SpecViewer: failed to list files", err);
      });
  }, [projectRootPath, selectedFilePath]);

  // ── Load & shard selected file ──────────────────────────────────────
  useEffect(() => {
    if (!selectedFilePath) {
      setDocument(null);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setSelectedSectionId(null);
    setCheckedIds(new Set());

    invoke<FileContent>("read_file", { path: selectedFilePath })
      .then((result) => {
        const doc = shardDocument(selectedFilePath, result.content);
        setDocument(doc);
        // Default: expand all top-level sections
        const topLevel = new Set(
          doc.sections.filter((s) => s.parentId === null).map((s) => s.id)
        );
        setExpandedIds(topLevel);
        // Auto-select first section
        if (doc.sections.length > 0) {
          setSelectedSectionId(doc.sections[0].id);
        }
      })
      .catch((err) => {
        setLoadError(String(err));
        setDocument(null);
      })
      .finally(() => setLoading(false));
  }, [selectedFilePath]);

  // ── Expand / collapse helpers ────────────────────────────────────────
  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!document) return;
    setExpandedIds(new Set(document.sections.map((s) => s.id)));
  }, [document]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // ── Check helpers ────────────────────────────────────────────────────
  const toggleCheck = useCallback((id: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Selected section content ─────────────────────────────────────────
  const selectedSection =
    document?.sections.find((s) => s.id === selectedSectionId) ?? null;

  // ── Filtered sections for search ────────────────────────────────────
  const filteredRootSections = document
    ? document.sections.filter((s) => {
        if (s.parentId !== null) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        // Show if the section or any descendant matches
        const allDescendants = [s, ...getDescendants(s.id, document.sections)];
        return allDescendants.some((d) =>
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q)
        );
      })
    : [];

  // ── Assign checked sections to agent ────────────────────────────────
  const assignToAgent = useCallback(() => {
    if (!document || checkedIds.size === 0) return;
    const selectedSections = document.sections.filter((s) =>
      checkedIds.has(s.id)
    );
    const combinedContent = selectedSections
      .map((s) => s.content)
      .join("\n\n---\n\n");
    const totalTokens = selectedSections.reduce(
      (sum, s) => sum + s.estimatedTokens,
      0
    );
    const taskDescription = `Work on the following spec sections (${formatTokens(totalTokens)}):\n\n${combinedContent}`;
    const name = `Spec Agent — ${selectedSections.map((s) => s.title).slice(0, 2).join(", ")}${selectedSections.length > 2 ? "…" : ""}`;
    createAgent({ name, taskDescription });
    toast.success(`Created agent for ${selectedSections.length} section(s)`);
    setCheckedIds(new Set());
  }, [document, checkedIds, createAgent]);

  // ── Copy selected content to clipboard ──────────────────────────────
  const copySelected = useCallback(async () => {
    if (!document || checkedIds.size === 0) {
      toast("No sections selected");
      return;
    }
    const selectedSections = document.sections.filter((s) =>
      checkedIds.has(s.id)
    );
    const combined = selectedSections.map((s) => s.content).join("\n\n---\n\n");
    await navigator.clipboard.writeText(combined);
    toast.success(`Copied ${selectedSections.length} section(s) to clipboard`);
  }, [document, checkedIds]);

  const checkedTokens = document
    ? document.sections
        .filter((s) => checkedIds.has(s.id))
        .reduce((sum, s) => sum + s.estimatedTokens, 0)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header / file picker */}
      <div
        className="flex items-center gap-2 px-3 h-9 shrink-0"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        <BookOpen size={14} style={{ color: "var(--color-blue)", flexShrink: 0 }} />
        <select
          className="flex-1 text-xs outline-none cursor-pointer min-w-0 truncate rounded px-1 py-0.5"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          }}
          value={selectedFilePath}
          onChange={(e) => setSelectedFilePath(e.target.value)}
          aria-label="Select markdown file"
        >
          {mdFiles.length === 0 && (
            <option
              value=""
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-text)",
              }}
            >
              No .md files found in project
            </option>
          )}
          {mdFiles.map((f) => (
            <option
              key={f.path}
              value={f.path}
              style={{
                backgroundColor: "var(--color-surface-0)",
                color: "var(--color-text)",
              }}
            >
              {f.name}
            </option>
          ))}
        </select>

        {document && (
          <span
            className="text-xs shrink-0 opacity-70"
            style={{ color: "var(--color-overlay-0)" }}
          >
            {formatTokens(document.totalTokens)}
          </span>
        )}
      </div>

      {/* Main two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Table of Contents */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 240,
            borderRight: "1px solid var(--color-surface-0)",
            backgroundColor: "var(--color-mantle)",
          }}
        >
          {/* Search + expand/collapse controls */}
          <div
            className="flex items-center gap-1 px-2 py-1 shrink-0"
            style={{ borderBottom: "1px solid var(--color-surface-0)" }}
          >
            <div
              className="flex items-center gap-1 flex-1 h-6 rounded px-2"
              style={{
                backgroundColor: "var(--color-base)",
                border: "1px solid var(--color-surface-1)",
              }}
            >
              <Search size={10} style={{ color: "var(--color-overlay-0)", flexShrink: 0 }} />
              <input
                type="text"
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: "var(--color-text)" }}
                placeholder="Search sections…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="text-xs px-1 py-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={expandAll}
              title="Expand all"
            >
              ↕
            </button>
            <button
              className="text-xs px-1 py-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={collapseAll}
              title="Collapse all"
            >
              ↑
            </button>
          </div>

          {/* ToC list */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading && (
              <div className="flex items-center justify-center py-8 gap-2"
                style={{ color: "var(--color-overlay-1)" }}>
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Loading…</span>
              </div>
            )}

            {loadError && (
              <div className="px-3 py-4 text-xs" style={{ color: "var(--color-red)" }}>
                {loadError}
              </div>
            )}

            {!loading && !loadError && document && filteredRootSections.length === 0 && (
              <div className="px-3 py-4 text-xs" style={{ color: "var(--color-overlay-1)" }}>
                No sections match "{searchQuery}".
              </div>
            )}

            {!loading && !loadError && !document && !selectedFilePath && (
              <div className="px-3 py-4 text-xs" style={{ color: "var(--color-overlay-1)" }}>
                Select a markdown file above.
              </div>
            )}

            {!loading && document && (
              <>
                {filteredRootSections.map((section) => (
                  <TocNode
                    key={section.id}
                    section={section}
                    allSections={document.sections}
                    depth={0}
                    selectedId={selectedSectionId}
                    expandedIds={expandedIds}
                    checkedIds={checkedIds}
                    onSelect={setSelectedSectionId}
                    onToggleExpand={toggleExpand}
                    onToggleCheck={toggleCheck}
                  />
                ))}

                {document.sections.length === 0 && (
                  <div className="px-3 py-4 text-xs" style={{ color: "var(--color-overlay-1)" }}>
                    No ## headings found in this document.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom action bar */}
          {document && checkedIds.size > 0 && (
            <div
              className="shrink-0 px-2 py-2 flex flex-col gap-1"
              style={{ borderTop: "1px solid var(--color-surface-0)" }}
            >
              <div className="text-xs mb-1" style={{ color: "var(--color-subtext-0)" }}>
                {checkedIds.size} selected (~{formatTokens(checkedTokens)})
              </div>
              <div className="flex gap-1">
                <button
                  className="flex items-center gap-1 flex-1 justify-center text-xs h-6 rounded transition-colors"
                  style={{
                    backgroundColor: "var(--color-blue)",
                    color: "var(--color-base)",
                  }}
                  onClick={assignToAgent}
                  title="Create an agent with selected sections as task"
                >
                  <Bot size={11} />
                  Assign to Agent
                </button>
                <button
                  className="flex items-center gap-1 px-2 text-xs h-6 rounded transition-colors hover:bg-[var(--color-surface-1)]"
                  style={{ color: "var(--color-overlay-1)" }}
                  onClick={copySelected}
                  title="Copy selected sections to clipboard"
                >
                  <Copy size={11} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — Section content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "var(--color-base)" }}
        >
          {selectedSection ? (
            <div className="p-4">
              <div
                className="flex items-center gap-2 mb-3 pb-2"
                style={{ borderBottom: "1px solid var(--color-surface-0)" }}
              >
                <FileText size={14} style={{ color: "var(--color-blue)" }} />
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-subtext-0)" }}
                >
                  {"#".repeat(selectedSection.level)} section ·{" "}
                  {formatTokens(selectedSection.estimatedTokens)} ·{" "}
                  lines {selectedSection.startLine + 1}–{selectedSection.endLine}
                </span>
              </div>
              <article className="max-w-none markdown-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedSection.content}
                </ReactMarkdown>
              </article>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center h-full gap-2"
              style={{ color: "var(--color-overlay-1)" }}
            >
              <BookOpen size={28} style={{ color: "var(--color-overlay-0)" }} />
              <p className="text-xs">Select a section from the table of contents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Utility: collect all descendant sections ─────────────────────────

function getDescendants(
  id: number,
  sections: DocumentSection[]
): DocumentSection[] {
  const result: DocumentSection[] = [];
  const section = sections.find((s) => s.id === id);
  if (!section) return result;
  for (const childId of section.childIds) {
    const child = sections.find((s) => s.id === childId);
    if (child) {
      result.push(child);
      result.push(...getDescendants(child.id, sections));
    }
  }
  return result;
}
