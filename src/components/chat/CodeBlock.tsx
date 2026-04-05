import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { codeToHtml } from "shiki";

// ─── Language display name map ──────────────────────────────────────────────

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  java: "Java",
  cs: "C#",
  cpp: "C++",
  c: "C",
  rb: "Ruby",
  ruby: "Ruby",
  sh: "Shell",
  shell: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  fish: "Fish",
  ps1: "PowerShell",
  powershell: "PowerShell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  sql: "SQL",
  md: "Markdown",
  markdown: "Markdown",
  text: "Plain Text",
  txt: "Plain Text",
  diff: "Diff",
  dockerfile: "Dockerfile",
  graphql: "GraphQL",
  prisma: "Prisma",
  swift: "Swift",
  kotlin: "Kotlin",
  dart: "Dart",
  lua: "Lua",
  vim: "Vim Script",
  r: "R",
  scala: "Scala",
  php: "PHP",
};

function getDisplayName(lang: string): string {
  return LANGUAGE_DISPLAY_NAMES[lang.toLowerCase()] ?? lang;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const codeContainerRef = useRef<HTMLDivElement>(null);

  // Highlight via shiki
  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const html = await codeToHtml(code, {
          lang: language ?? "text",
          theme: "catppuccin-mocha",
        });
        if (!cancelled) {
          setHighlightedHtml(html);
        }
      } catch {
        // Shiki failed (e.g. unknown language) -- keep null to show fallback
      }
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  // Render shiki output into the container via DOM API.
  // SECURITY NOTE: The HTML here is produced by the shiki syntax highlighting
  // library from code content, not from arbitrary user HTML. This is a trusted
  // source, equivalent to how shiki is used in documentation sites.
  useEffect(() => {
    const container = codeContainerRef.current;
    if (!container || !highlightedHtml) return;

    // Clear existing children safely
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Use DOMParser to safely parse the shiki-generated markup
    const parser = new DOMParser();
    const doc = parser.parseFromString(highlightedHtml, "text/html");
    const nodes = doc.body.childNodes;
    for (let i = 0; i < nodes.length; i++) {
      const imported = document.importNode(nodes[i], true);
      container.appendChild(imported);
    }
  }, [highlightedHtml]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }, [code]);

  const rawLang = language ?? "text";
  const displayLang = filename ? filename : getDisplayName(rawLang);

  return (
    <div
      className="rounded-md overflow-hidden my-2 text-xs"
      style={{
        backgroundColor: "var(--color-mantle)",
        border: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          backgroundColor: "var(--color-surface-0)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {/* Language label — clickable to copy */}
        <button
          type="button"
          className="flex items-center gap-2 px-1 py-0.5 rounded text-xs transition-colors hover:bg-[var(--color-surface-1)] cursor-pointer"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-subtext-0)",
            background: "none",
            border: "none",
          }}
          onClick={handleCopy}
          title="Click to copy code"
          aria-label={`${displayLang} — click to copy`}
        >
          {displayLang}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-[var(--color-surface-1)]"
          style={{ color: "var(--color-overlay-1)" }}
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto p-3">
        {highlightedHtml ? (
          <div
            ref={codeContainerRef}
            className="shiki-container text-xs leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!text-xs"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        ) : (
          <pre
            className="m-0 p-0 whitespace-pre-wrap break-words"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--color-text)",
            }}
          >
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
