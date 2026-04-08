import { describe, it, expect } from "vitest";
import {
  parseAgentsMd,
  suggestRole,
  AGENTS_MD_TEMPLATE,
} from "../agentsmd";

describe("agentsmd", () => {
  describe("parseAgentsMd", () => {
    it("parses the default template into expected roles", () => {
      const config = parseAgentsMd(AGENTS_MD_TEMPLATE);
      expect(config.roles.length).toBeGreaterThanOrEqual(4);

      const names = config.roles.map((r) => r.name);
      expect(names).toContain("coordinator");
      expect(names).toContain("backend-specialist");
      expect(names).toContain("frontend-specialist");
      expect(names).toContain("verifier");
    });

    it("preserves raw content", () => {
      const config = parseAgentsMd(AGENTS_MD_TEMPLATE);
      expect(config.raw).toBe(AGENTS_MD_TEMPLATE);
    });

    it("parses model, description, triggers, and files", () => {
      const md = `# Roles

## my-builder
- Model: claude-opus-4-5
- Description: Does building things
- Triggers: build, compile, make
- Files: src/**, lib/**
`;
      const config = parseAgentsMd(md);
      expect(config.roles).toHaveLength(1);

      const role = config.roles[0];
      expect(role.name).toBe("my-builder");
      expect(role.model).toBe("claude-opus-4-5");
      expect(role.description).toBe("Does building things");
      expect(role.triggers).toEqual(["build", "compile", "make"]);
      expect(role.filePatterns).toEqual(["src/**", "lib/**"]);
    });

    it("infers agentRole from role name", () => {
      const md = `
## team-coordinator
- Description: Leads the team

## code-reviewer
- Description: Reviews PRs

## backend-specialist
- Description: Backend work

## generic-worker
- Description: General tasks
`;
      const config = parseAgentsMd(md);
      const roles = config.roles;

      expect(roles.find((r) => r.name === "team-coordinator")!.agentRole).toBe("coordinator");
      expect(roles.find((r) => r.name === "code-reviewer")!.agentRole).toBe("verifier");
      expect(roles.find((r) => r.name === "backend-specialist")!.agentRole).toBe("specialist");
      expect(roles.find((r) => r.name === "generic-worker")!.agentRole).toBe("builder");
    });

    it("uses defaults for missing fields", () => {
      const md = `
## minimal-role
`;
      const config = parseAgentsMd(md);
      expect(config.roles).toHaveLength(1);

      const role = config.roles[0];
      expect(role.model).toBe("claude-sonnet-4-6");
      expect(role.description).toBe("");
      expect(role.triggers).toEqual([]);
      expect(role.filePatterns).toEqual([]);
    });

    it("handles quoted trigger values", () => {
      const md = `
## worker
- Triggers: "api", "endpoint", "server"
`;
      const config = parseAgentsMd(md);
      expect(config.roles[0].triggers).toEqual(["api", "endpoint", "server"]);
    });

    it("returns empty roles for content without ## headings", () => {
      const config = parseAgentsMd("# Just a title\n\nSome paragraph text.");
      expect(config.roles).toEqual([]);
    });

    it("ignores unrecognized bullet keys", () => {
      const md = `
## worker
- Model: claude-sonnet-4-5
- Author: John Doe
- Description: A worker
`;
      const config = parseAgentsMd(md);
      expect(config.roles).toHaveLength(1);
      expect(config.roles[0].description).toBe("A worker");
    });
  });

  describe("suggestRole", () => {
    const config = parseAgentsMd(AGENTS_MD_TEMPLATE);

    it("suggests coordinator for planning tasks", () => {
      const role = suggestRole("I need to plan the architecture", config);
      expect(role).not.toBeNull();
      expect(role!.name).toBe("coordinator");
    });

    it("suggests backend-specialist for API tasks", () => {
      const role = suggestRole("Build the REST API endpoint", config);
      expect(role).not.toBeNull();
      expect(role!.name).toBe("backend-specialist");
    });

    it("suggests frontend-specialist for UI tasks", () => {
      const role = suggestRole("Create a new component for the form", config);
      expect(role).not.toBeNull();
      expect(role!.name).toBe("frontend-specialist");
    });

    it("suggests verifier for review tasks", () => {
      const role = suggestRole("Review and validate the code", config);
      expect(role).not.toBeNull();
      expect(role!.name).toBe("verifier");
    });

    it("returns null when no triggers match", () => {
      const role = suggestRole("something completely unrelated xyz", config);
      expect(role).toBeNull();
    });

    it("picks the role with the most trigger matches", () => {
      // "api endpoint server backend" matches 4 triggers for backend-specialist
      const role = suggestRole("build api endpoint server backend", config);
      expect(role).not.toBeNull();
      expect(role!.name).toBe("backend-specialist");
    });
  });
});
