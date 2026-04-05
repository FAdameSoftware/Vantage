/**
 * Mention Resolver
 *
 * Resolves @-mention tokens in the chat input to actual content that gets
 * prepended to the user's message before sending to Claude.
 */

import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";

// ── Types ───────────────────────────────────────────────────────────────────

export type MentionType = "file" | "selection" | "terminal" | "git" | "folder";

export interface MentionSource {
  type: MentionType;
  /** Human-readable name shown in the autocomplete dropdown */
  label: string;
  /** Short description of what this mention provides */
  description: string;
  /** Icon name (lucide icon) */
  icon: string;
  /** Whether the user needs to pick a sub-item (e.g., file path) */
  needsExtra: boolean;
}

export interface ResolvedMention {
  type: MentionType;
  /** Display text, e.g. "@file:src/App.tsx" */
  label: string;
  /** Actual content to prepend to the message */
  content: string;
}

// ── Available mention sources ───────────────────────────────────────────────

export const MENTION_SOURCES: MentionSource[] = [
  {
    type: "file",
    label: "file",
    description: "Include a file's content",
    icon: "FileText",
    needsExtra: true,
  },
  {
    type: "selection",
    label: "selection",
    description: "Include current editor selection",
    icon: "TextSelect",
    needsExtra: false,
  },
  {
    type: "terminal",
    label: "terminal",
    description: "Include recent terminal output",
    icon: "Terminal",
    needsExtra: false,
  },
  {
    type: "git",
    label: "git",
    description: "Include git diff of working changes",
    icon: "GitBranch",
    needsExtra: false,
  },
  {
    type: "folder",
    label: "folder",
    description: "Include folder structure (depth 2)",
    icon: "FolderTree",
    needsExtra: false,
  },
];

/**
 * Filter mention sources by a query string typed after "@".
 * Returns sources whose label starts with the query, followed by
 * those whose label or description contains the query.
 */
export function filterMentionSources(query: string): MentionSource[] {
  if (!query) return MENTION_SOURCES;

  const q = query.toLowerCase();
  const prefix: MentionSource[] = [];
  const contains: MentionSource[] = [];

  for (const source of MENTION_SOURCES) {
    const labelLower = source.label.toLowerCase();
    const descLower = source.description.toLowerCase();

    if (labelLower.startsWith(q)) {
      prefix.push(source);
    } else if (labelLower.includes(q) || descLower.includes(q)) {
      contains.push(source);
    }
  }

  return [...prefix, ...contains];
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve a mention type (and optional extra data like a file path) into
 * actual content that can be prepended to a chat message.
 */
export async function resolveMention(
  type: MentionType,
  extra?: string,
): Promise<ResolvedMention> {
  switch (type) {
    case "file":
      return resolveFileMention(extra);
    case "selection":
      return resolveSelectionMention();
    case "terminal":
      return resolveTerminalMention();
    case "git":
      return resolveGitMention();
    case "folder":
      return resolveFolderMention();
    default:
      throw new Error(`Unknown mention type: ${type}`);
  }
}

// ── Individual resolvers ────────────────────────────────────────────────────

async function resolveFileMention(
  filePath?: string,
): Promise<ResolvedMention> {
  if (!filePath) {
    throw new Error("File path is required for @file mention");
  }

  const result = await invoke<{ path: string; content: string; language: string }>(
    "read_file",
    { path: filePath },
  );

  // Extract just the filename for the label
  const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const shortPath = filePath.replace(/\\/g, "/");

  return {
    type: "file",
    label: `@file:${fileName}`,
    content: `[Context: @file:${shortPath}]\n\`\`\`${result.language}\n${result.content}\n\`\`\`\n[End context]`,
  };
}

function resolveSelectionMention(): Promise<ResolvedMention> {
  const activeTab = useEditorStore.getState().getActiveTab();

  if (!activeTab) {
    return Promise.resolve({
      type: "selection",
      label: "@selection",
      content: "[Context: @selection]\n(No file is currently open)\n[End context]",
    });
  }

  // Try to get the selection from the Monaco editor instance.
  // The editor store tracks content but not selection ranges directly,
  // so we read the full content as context.
  // In practice the MonacoEditor component would need to expose
  // selection, but for now we use the full active file content as a
  // reasonable fallback.
  const content = activeTab.content;
  const fileName = activeTab.name;

  return Promise.resolve({
    type: "selection",
    label: `@selection:${fileName}`,
    content: `[Context: @selection from ${fileName}]\n\`\`\`${activeTab.language}\n${content}\n\`\`\`\n[End context]`,
  });
}

async function resolveTerminalMention(): Promise<ResolvedMention> {
  // Terminal output is not directly accessible from a store in the current
  // architecture (xterm.js manages its own buffer). We provide a
  // placeholder that explains the limitation. In a future iteration we
  // can wire the xterm buffer through a store or Rust-side capture.
  return {
    type: "terminal",
    label: "@terminal",
    content:
      "[Context: @terminal]\n(Terminal output capture is not yet wired. Paste the relevant output into the chat instead.)\n[End context]",
  };
}

async function resolveGitMention(): Promise<ResolvedMention> {
  const cwd = useLayoutStore.getState().projectRootPath ?? ".";

  try {
    const diff = await invoke<string>("git_diff_working", { cwd });

    if (!diff || diff.trim().length === 0) {
      return {
        type: "git",
        label: "@git",
        content: "[Context: @git]\n(No working changes detected)\n[End context]",
      };
    }

    return {
      type: "git",
      label: "@git",
      content: `[Context: @git diff]\n\`\`\`diff\n${diff}\n\`\`\`\n[End context]`,
    };
  } catch (err) {
    return {
      type: "git",
      label: "@git",
      content: `[Context: @git]\n(Failed to get git diff: ${String(err)})\n[End context]`,
    };
  }
}

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[] | null;
}

async function resolveFolderMention(): Promise<ResolvedMention> {
  const cwd = useLayoutStore.getState().projectRootPath ?? ".";

  try {
    const tree = await invoke<FileNode[]>("get_file_tree", { path: cwd });

    const lines: string[] = [];
    renderTree(tree, "", lines, 0, 2);

    return {
      type: "folder",
      label: "@folder",
      content: `[Context: @folder structure]\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n[End context]`,
    };
  } catch (err) {
    return {
      type: "folder",
      label: "@folder",
      content: `[Context: @folder]\n(Failed to get folder structure: ${String(err)})\n[End context]`,
    };
  }
}

/** Recursively render a file tree as indented text, up to maxDepth. */
function renderTree(
  nodes: FileNode[],
  indent: string,
  lines: string[],
  depth: number,
  maxDepth: number,
): void {
  for (const node of nodes) {
    const prefix = node.is_dir ? "+ " : "  ";
    lines.push(`${indent}${prefix}${node.name}`);
    if (node.is_dir && node.children && depth < maxDepth) {
      renderTree(node.children, indent + "  ", lines, depth + 1, maxDepth);
    }
  }
}

// ── Message formatting ──────────────────────────────────────────────────────

/**
 * Format resolved mentions and the user's message into a single string
 * ready to be sent to Claude.
 */
export function formatMessageWithMentions(
  mentions: ResolvedMention[],
  userMessage: string,
): string {
  if (mentions.length === 0) return userMessage;

  const contextBlocks = mentions.map((m) => m.content).join("\n\n");
  return `${contextBlocks}\n\n${userMessage}`;
}
