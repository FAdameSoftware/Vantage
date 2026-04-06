/** Shared popup animation props for status bar dropdowns */
export const popupMotion = {
  initial: { opacity: 0, y: 4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 4, scale: 0.98 },
  transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
};

/** Map vim mode labels to Catppuccin colors */
export function vimModeLabelColor(label: string): string {
  switch (label) {
    case "INSERT":
      return "var(--color-green)";
    case "VISUAL":
    case "V-LINE":
    case "V-BLOCK":
      return "var(--color-mauve)";
    case "REPLACE":
      return "var(--color-red)";
    case "NORMAL":
    default:
      return "var(--color-blue)";
  }
}

/** Map Monaco language IDs to human-readable display names */
export function getLanguageDisplayName(languageId: string): string {
  const names: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    rust: "Rust",
    python: "Python",
    json: "JSON",
    toml: "TOML",
    yaml: "YAML",
    markdown: "Markdown",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    xml: "XML",
    shell: "Shell Script",
    powershell: "PowerShell",
    bat: "Batch",
    sql: "SQL",
    go: "Go",
    java: "Java",
    c: "C",
    cpp: "C++",
    csharp: "C#",
    ruby: "Ruby",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    lua: "Lua",
    r: "R",
    dockerfile: "Dockerfile",
    graphql: "GraphQL",
    ini: "INI",
    plaintext: "Plain Text",
  };
  return names[languageId] ?? languageId;
}
