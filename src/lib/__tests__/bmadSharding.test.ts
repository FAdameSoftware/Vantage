import { describe, it, expect } from "vitest";
import { shardDocument } from "../bmadSharding";

describe("bmadSharding", () => {
  describe("shardDocument", () => {
    it("extracts document title from # heading", () => {
      const doc = shardDocument("test.md", "# My Document\n\nSome text.");
      expect(doc.title).toBe("My Document");
    });

    it("uses filename when no # heading exists", () => {
      const doc = shardDocument("/path/to/notes.md", "## Section One\n\nContent.");
      expect(doc.title).toBe("notes.md");
    });

    it("parses ## headings into sections", () => {
      const content = `# Doc

## Section A
Content A

## Section B
Content B
`;
      const doc = shardDocument("test.md", content);
      expect(doc.sections).toHaveLength(2);
      expect(doc.sections[0].title).toBe("Section A");
      expect(doc.sections[0].level).toBe(2);
      expect(doc.sections[1].title).toBe("Section B");
    });

    it("computes correct start and end lines", () => {
      const content = `# Doc

## First
Line 1
Line 2

## Second
Line 3
`;
      const doc = shardDocument("test.md", content);
      expect(doc.sections[0].startLine).toBe(2); // "## First" is line index 2
      expect(doc.sections[0].endLine).toBe(6);   // ends before "## Second"
      expect(doc.sections[1].startLine).toBe(6);
      expect(doc.sections[1].endLine).toBe(9);   // EOF (includes trailing newline)
    });

    it("establishes parent-child relationships for nested headings", () => {
      const content = `## Parent
### Child A
Content A
### Child B
Content B
`;
      const doc = shardDocument("test.md", content);
      expect(doc.sections).toHaveLength(3);

      // Parent (##) has two children (###)
      expect(doc.sections[0].parentId).toBeNull();
      expect(doc.sections[0].childIds).toEqual([1, 2]);

      // Children reference parent
      expect(doc.sections[1].parentId).toBe(0);
      expect(doc.sections[2].parentId).toBe(0);
    });

    it("handles ### under ## and #### under ###", () => {
      const content = `## Level 2
### Level 3
#### Level 4
Deep content
`;
      const doc = shardDocument("test.md", content);
      expect(doc.sections).toHaveLength(3);

      expect(doc.sections[0].level).toBe(2);
      expect(doc.sections[1].level).toBe(3);
      expect(doc.sections[2].level).toBe(4);

      expect(doc.sections[1].parentId).toBe(0);
      expect(doc.sections[2].parentId).toBe(1);
      expect(doc.sections[0].childIds).toEqual([1]);
      expect(doc.sections[1].childIds).toEqual([2]);
    });

    it("estimates tokens for each section", () => {
      const content = `## Short
One two three

## Longer
One two three four five six seven eight nine ten
`;
      const doc = shardDocument("test.md", content);

      // "## Short\nOne two three" = 4 words * 1.3 = ceil(5.2) = 6
      expect(doc.sections[0].estimatedTokens).toBeGreaterThan(0);
      // Longer section should have more tokens
      expect(doc.sections[1].estimatedTokens).toBeGreaterThan(doc.sections[0].estimatedTokens);
    });

    it("computes totalTokens for the full document", () => {
      const content = `# Title\n\n## Section\nSome content here.`;
      const doc = shardDocument("test.md", content);
      expect(doc.totalTokens).toBeGreaterThan(0);
    });

    it("preserves raw content", () => {
      const content = "## Hello\nWorld";
      const doc = shardDocument("test.md", content);
      expect(doc.rawContent).toBe(content);
    });

    it("preserves filePath", () => {
      const doc = shardDocument("/my/path/doc.md", "## Sec\nText");
      expect(doc.filePath).toBe("/my/path/doc.md");
    });

    it("returns empty sections for content with no ## headings", () => {
      const doc = shardDocument("test.md", "# Title\n\nJust a paragraph.\n\nAnother paragraph.");
      expect(doc.sections).toEqual([]);
    });

    it("handles section ending at the same level", () => {
      const content = `## A
Content A
## B
Content B
## C
Content C
`;
      const doc = shardDocument("test.md", content);
      expect(doc.sections).toHaveLength(3);
      // Each ## section ends where the next ## begins
      expect(doc.sections[0].endLine).toBe(doc.sections[1].startLine);
      expect(doc.sections[1].endLine).toBe(doc.sections[2].startLine);
    });
  });
});
