import { useEditorStore } from "@/stores/editor";
import { useLayoutStore } from "@/stores/layout";

// ─── Shared helpers used across widgets ─────────────────────────────────────

/** Normalize a file path the same way the editor store does */
export function normalizeFilePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, "/");
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

/** Detect Monaco language ID from a file extension */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "text";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", md: "markdown", css: "css", scss: "scss", html: "html",
    rs: "rust", py: "python", go: "go", java: "java", rb: "ruby",
    sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml", toml: "toml",
    sql: "sql", xml: "xml", svg: "xml", vue: "html", svelte: "html",
  };
  return map[ext] ?? ext;
}

/** Extract just the filename from a path */
export function fileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/** Open a file in the IDE editor (switches to IDE view if in Claude View) */
export function openFileInEditor(filePath: string) {
  const normalized = normalizeFilePath(filePath);
  const name = fileName(filePath);
  const language = detectLanguage(filePath);
  useEditorStore.getState().openFile(normalized, name, language, "", false);
  useLayoutStore.getState().setViewMode("ide");
}
