// ── BMAD Document Sharding ────────────────────────────────────────────
// Parses markdown documents into sections by ## headings (and deeper),
// computes token estimates, and establishes parent-child relationships.

export interface DocumentSection {
  /** Section ID (index in the document, 0-based) */
  id: number;
  /** Heading level (2 for ##, 3 for ###, 4 for ####) */
  level: number;
  /** The heading text (without # prefix and whitespace) */
  title: string;
  /** Start line number in the original document (0-based) */
  startLine: number;
  /** End line number (exclusive) – start of next section or EOF */
  endLine: number;
  /** The raw content of this section (including the heading line) */
  content: string;
  /** Approximate token count (word_count * 1.3, rounded up) */
  estimatedTokens: number;
  /** Child section IDs (### under ##, #### under ###) */
  childIds: number[];
  /** Parent section ID (null for top-level ## sections) */
  parentId: number | null;
}

export interface ShardedDocument {
  /** Original file path */
  filePath: string;
  /** Document title (first # heading or filename) */
  title: string;
  /** All sections in document order */
  sections: DocumentSection[];
  /** Total estimated tokens for the full document */
  totalTokens: number;
  /** Full raw content */
  rawContent: string;
}

/**
 * Estimate tokens in a string.
 * Rough heuristic: split on whitespace and multiply by 1.3.
 */
function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

/**
 * Parse a markdown document into sections based on ## (and deeper) headings.
 */
export function shardDocument(filePath: string, content: string): ShardedDocument {
  const lines = content.split("\n");

  // ── Pass 1: collect heading positions ──────────────────────────────
  interface HeadingEntry {
    level: number;
    title: string;
    lineIndex: number;
  }

  const headings: HeadingEntry[] = [];
  const HEADING_RE = /^(#{2,4})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        lineIndex: i,
      });
    }
  }

  // ── Pass 2: compute content ranges ─────────────────────────────────
  // Each section ends just before the next heading of equal or lesser depth,
  // or at EOF if none.
  const sections: DocumentSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const startLine = h.lineIndex;
    let endLine = lines.length; // default: EOF

    // Find next heading at same or shallower level
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        endLine = headings[j].lineIndex;
        break;
      }
    }

    const sectionLines = lines.slice(startLine, endLine);
    const sectionContent = sectionLines.join("\n");

    sections.push({
      id: i,
      level: h.level,
      title: h.title,
      startLine,
      endLine,
      content: sectionContent,
      estimatedTokens: estimateTokens(sectionContent),
      childIds: [],
      parentId: null,
    });
  }

  // ── Pass 3: establish parent-child relationships ────────────────────
  // For each section, its parent is the most recent section with level = current.level - 1
  // that appears before it.
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.level <= 2) {
      s.parentId = null;
      continue;
    }
    const targetParentLevel = s.level - 1;
    // Scan backwards for the nearest ancestor with targetParentLevel
    for (let j = i - 1; j >= 0; j--) {
      if (sections[j].level === targetParentLevel) {
        s.parentId = sections[j].id;
        sections[j].childIds.push(s.id);
        break;
      }
    }
  }

  // ── Extract document title ──────────────────────────────────────────
  const titleMatch = content.match(/^# (.+)$/m);
  const fileName = filePath.split(/[\\/]/).pop() ?? "Untitled";
  const title = titleMatch ? titleMatch[1].trim() : fileName;

  return {
    filePath,
    title,
    sections,
    totalTokens: estimateTokens(content),
    rawContent: content,
  };
}
