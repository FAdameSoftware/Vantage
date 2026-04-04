import { describe, it, expect } from "vitest";
import {
  BUILTIN_COMMANDS,
  buildCommandList,
  filterCommands,
} from "../slashCommands";

describe("slashCommands", () => {
  describe("BUILTIN_COMMANDS", () => {
    it("contains expected built-in commands", () => {
      const names = BUILTIN_COMMANDS.map((c) => c.name);
      expect(names).toContain("help");
      expect(names).toContain("clear");
      expect(names).toContain("compact");
      expect(names).toContain("btw");
    });

    it("all built-in commands have source 'built-in' and isSkill false", () => {
      for (const cmd of BUILTIN_COMMANDS) {
        expect(cmd.source).toBe("built-in");
        expect(cmd.isSkill).toBe(false);
      }
    });
  });

  describe("buildCommandList", () => {
    it("returns built-in commands when no skills provided", () => {
      const list = buildCommandList([]);
      expect(list.length).toBe(BUILTIN_COMMANDS.length);
    });

    it("merges skills into the list with isSkill=true", () => {
      const skills = [
        { name: "deploy", description: "Deploy to production", source: "my-plugin" },
      ];
      const list = buildCommandList(skills);
      expect(list.length).toBe(BUILTIN_COMMANDS.length + 1);

      const deploy = list.find((c) => c.name === "deploy");
      expect(deploy).toBeDefined();
      expect(deploy!.isSkill).toBe(true);
      expect(deploy!.source).toBe("my-plugin");
    });

    it("returns alphabetically sorted results", () => {
      const skills = [
        { name: "aaa-first", description: "Should be first", source: "test" },
        { name: "zzz-last", description: "Should be last", source: "test" },
      ];
      const list = buildCommandList(skills);
      const names = list.map((c) => c.name);

      // Verify sorting
      for (let i = 1; i < names.length; i++) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }

      expect(names[0]).toBe("aaa-first");
      expect(names[names.length - 1]).toBe("zzz-last");
    });
  });

  describe("filterCommands", () => {
    const allCommands = buildCommandList([
      { name: "deploy", description: "Deploy to production", source: "test" },
      { name: "deep-clean", description: "Clean build artifacts", source: "test" },
    ]);

    it("returns up to 12 commands for empty query", () => {
      const results = filterCommands(allCommands, "");
      expect(results.length).toBeLessThanOrEqual(12);
      expect(results.length).toBeGreaterThan(0);
    });

    it("prefix matches on name come first", () => {
      const results = filterCommands(allCommands, "de");
      // "deep-clean" and "deploy" should be first (prefix match on name)
      expect(results.length).toBeGreaterThanOrEqual(2);
      const firstNames = results.slice(0, 2).map((c) => c.name);
      expect(firstNames).toContain("deploy");
      expect(firstNames).toContain("deep-clean");
    });

    it("matches in description are included", () => {
      const results = filterCommands(allCommands, "production");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe("deploy");
    });

    it("is case-insensitive", () => {
      const results = filterCommands(allCommands, "HELP");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe("help");
    });

    it("caps results at 12", () => {
      // Create many commands
      const many = Array.from({ length: 20 }, (_, i) => ({
        name: `cmd-${i}`,
        description: `desc matching query`,
        source: "test" as const,
        isSkill: false,
      }));
      const results = filterCommands(many, "cmd");
      expect(results.length).toBe(12);
    });

    it("returns empty array when nothing matches", () => {
      const results = filterCommands(allCommands, "xyznonexistent");
      expect(results).toEqual([]);
    });
  });
});
