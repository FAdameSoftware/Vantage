// ── Unified extension-to-language mapping ──────────────────────────────────
//
// Single source of truth for file extension → Monaco language ID lookups.
// Previously duplicated in useClaude.ts, GitLogPanel.tsx, and ActivityTrail.tsx.

/** Map of file extensions (without dot) to Monaco language IDs */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  rs: "rust",
  py: "python",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  graphql: "graphql",
  svg: "xml",
  xml: "xml",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  lua: "lua",
  r: "r",
  dockerfile: "dockerfile",
  ini: "ini",
  txt: "plaintext",
};

/**
 * Guess the Monaco language ID from a file path or extension.
 *
 * @param filePathOrExt - A full file path (e.g., "src/foo.ts") or bare
 *   extension (e.g., "ts"). Extensions are matched case-insensitively.
 * @returns The Monaco language ID, or "plaintext" if unknown.
 */
export function guessLanguageFromPath(filePathOrExt: string): string {
  // Handle "Dockerfile" (no extension) by checking the basename
  const basename = filePathOrExt.split("/").pop()?.split("\\").pop() ?? filePathOrExt;
  if (basename.toLowerCase() === "dockerfile") return "dockerfile";

  const ext = basename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_LANGUAGE[ext] ?? "plaintext";
}

/**
 * Get the Monaco language ID from a bare file extension (no dot).
 *
 * @param ext - A file extension without the leading dot (e.g., "ts", "rs").
 * @returns The Monaco language ID, or "plaintext" if unknown.
 */
export function extensionToLanguage(ext: string): string {
  return EXTENSION_TO_LANGUAGE[ext.toLowerCase()] ?? "plaintext";
}
