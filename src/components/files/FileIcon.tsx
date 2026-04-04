import {
  File,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  Folder,
  FolderOpen,
  FileType,
  Cog,
  Package,
  GitBranch,
  FileTerminal,
} from "lucide-react";

interface FileIconProps {
  name: string;
  extension: string | null;
  isDir: boolean;
  isExpanded?: boolean;
  size?: number;
}

const EXTENSION_COLORS: Record<string, string> = {
  ts: "var(--color-blue)",
  tsx: "var(--color-blue)",
  js: "var(--color-yellow)",
  jsx: "var(--color-yellow)",
  json: "var(--color-yellow)",
  rs: "var(--color-peach)",
  py: "var(--color-blue)",
  md: "var(--color-subtext-1)",
  css: "var(--color-blue)",
  scss: "var(--color-pink)",
  html: "var(--color-peach)",
  svg: "var(--color-yellow)",
  png: "var(--color-mauve)",
  jpg: "var(--color-mauve)",
  gif: "var(--color-mauve)",
  toml: "var(--color-peach)",
  yaml: "var(--color-red)",
  yml: "var(--color-red)",
  sh: "var(--color-green)",
  bash: "var(--color-green)",
  ps1: "var(--color-blue)",
  go: "var(--color-sky)",
  java: "var(--color-red)",
  rb: "var(--color-red)",
  php: "var(--color-mauve)",
  sql: "var(--color-yellow)",
  graphql: "var(--color-pink)",
  lock: "var(--color-overlay-0)",
};

const SPECIAL_FILES: Record<string, { icon: typeof File; color: string }> = {
  "package.json": { icon: Package, color: "var(--color-green)" },
  "Cargo.toml": { icon: Package, color: "var(--color-peach)" },
  "tsconfig.json": { icon: Cog, color: "var(--color-blue)" },
  ".gitignore": { icon: GitBranch, color: "var(--color-overlay-0)" },
  "Dockerfile": { icon: FileTerminal, color: "var(--color-sky)" },
  "docker-compose.yml": { icon: FileTerminal, color: "var(--color-sky)" },
  ".env": { icon: Cog, color: "var(--color-yellow)" },
  ".env.local": { icon: Cog, color: "var(--color-yellow)" },
};

function getIconForExtension(ext: string | null): typeof File {
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "rs":
    case "py":
    case "go":
    case "java":
    case "rb":
    case "php":
    case "c":
    case "cpp":
    case "h":
    case "cs":
    case "swift":
    case "kt":
      return FileCode;
    case "json":
    case "toml":
    case "yaml":
    case "yml":
    case "xml":
      return FileJson;
    case "md":
    case "mdx":
    case "txt":
    case "log":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "ico":
    case "webp":
      return FileImage;
    case "css":
    case "scss":
    case "less":
    case "html":
      return FileType;
    case "sh":
    case "bash":
    case "ps1":
    case "bat":
    case "cmd":
      return FileTerminal;
    default:
      return File;
  }
}

export function FileIcon({
  name,
  extension,
  isDir,
  isExpanded = false,
  size = 16,
}: FileIconProps) {
  // Directories
  if (isDir) {
    const Icon = isExpanded ? FolderOpen : Folder;
    return <Icon size={size} style={{ color: "var(--color-peach)" }} />;
  }

  // Special files (matched by full name)
  const special = SPECIAL_FILES[name];
  if (special) {
    const Icon = special.icon;
    return <Icon size={size} style={{ color: special.color }} />;
  }

  // Extension-based icon and color
  const Icon = getIconForExtension(extension);
  const color = extension
    ? EXTENSION_COLORS[extension] ?? "var(--color-overlay-1)"
    : "var(--color-overlay-1)";

  return <Icon size={size} style={{ color }} />;
}
