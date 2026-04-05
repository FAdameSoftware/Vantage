import { describe, it, expect, beforeAll } from "vitest";

// ─── Setup: install the mock layer before any test runs ─────────────────────

let mockInvoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

beforeAll(async () => {
  // Import and install the mock layer (sets up window.__TAURI_INTERNALS__)
  const { setupMocks } = await import("@/lib/tauriMock");
  setupMocks();

  // Grab the invoke function from the mock internals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const internals = (window as any).__TAURI_INTERNALS__;
  mockInvoke = internals.invoke;
});

// ─── Mock IPC edge cases ────────────────────────────────────────────────────

describe("Mock IPC edge cases", () => {
  it("invoke with unknown command returns null", async () => {
    const result = await mockInvoke("completely_unknown_command_xyz");
    expect(result).toBeNull();
  });

  it("invoke with unknown command and arguments returns null", async () => {
    const result = await mockInvoke("nonexistent_command", {
      foo: "bar",
      count: 42,
    });
    expect(result).toBeNull();
  });

  it("invoke with missing arguments handles gracefully", async () => {
    // read_file expects args with path, but call with no args
    const result = await mockInvoke("read_file");
    expect(result).toBeDefined();
    // The mock returns a default response even without proper args
    expect(result).toHaveProperty("content");
  });

  it("invoke with empty args object handles gracefully", async () => {
    const result = await mockInvoke("read_file", {});
    expect(result).toBeDefined();
    expect(result).toHaveProperty("content");
  });

  it("invoke with null-like args handles gracefully", async () => {
    const result = await mockInvoke("get_file_tree", undefined);
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("invoke returns a promise (never throws synchronously)", () => {
    // Even for unknown commands, invoke should always return a promise
    const promise = mockInvoke("definitely_does_not_exist");
    expect(promise).toBeInstanceOf(Promise);
  });

  it("known commands return expected types", async () => {
    const fileTree = await mockInvoke("get_file_tree");
    expect(Array.isArray(fileTree)).toBe(true);

    const branch = await mockInvoke("get_git_branch");
    expect(branch).toHaveProperty("branch");

    const prerequisites = await mockInvoke("check_prerequisites");
    expect(Array.isArray(prerequisites)).toBe(true);

    const search = await mockInvoke("search_project");
    expect(search).toHaveProperty("files");
    expect(search).toHaveProperty("total_matches");
  });

  it("plugin:store commands work with in-memory store", async () => {
    // Load a store
    const rid = await mockInvoke("plugin:store|load", { path: "test-edge.json" });
    expect(typeof rid).toBe("number");

    // Set a value
    await mockInvoke("plugin:store|set", {
      rid,
      key: "testKey",
      value: "testValue",
    });

    // Get the value back
    const getResult = await mockInvoke("plugin:store|get", {
      rid,
      key: "testKey",
    });
    expect(getResult).toEqual(["testValue", true]);

    // Check non-existent key
    const missing = await mockInvoke("plugin:store|get", {
      rid,
      key: "nonExistent",
    });
    expect(missing).toEqual([null, false]);

    // Has check
    const has = await mockInvoke("plugin:store|has", {
      rid,
      key: "testKey",
    });
    expect(has).toBe(true);

    const hasNot = await mockInvoke("plugin:store|has", {
      rid,
      key: "nonExistent",
    });
    expect(hasNot).toBe(false);
  });

  it("plugin:store clear removes all entries", async () => {
    const rid = await mockInvoke("plugin:store|load", { path: "clear-test.json" });

    await mockInvoke("plugin:store|set", { rid, key: "a", value: 1 });
    await mockInvoke("plugin:store|set", { rid, key: "b", value: 2 });

    const lengthBefore = await mockInvoke("plugin:store|length", { rid });
    expect(lengthBefore).toBe(2);

    await mockInvoke("plugin:store|clear", { rid });

    const lengthAfter = await mockInvoke("plugin:store|length", { rid });
    expect(lengthAfter).toBe(0);
  });

  it("plugin:store with invalid rid returns null/empty gracefully", async () => {
    const result = await mockInvoke("plugin:store|get", {
      rid: 99999,
      key: "anything",
    });
    expect(result).toEqual([null, false]);

    const has = await mockInvoke("plugin:store|has", { rid: 99999, key: "x" });
    expect(has).toBe(false);

    const keys = await mockInvoke("plugin:store|keys", { rid: 99999 });
    expect(keys).toEqual([]);
  });

  it("multiple invocations of the same command are independent", async () => {
    const result1 = await mockInvoke("claude_start_session");
    const result2 = await mockInvoke("claude_start_session");

    expect(typeof result1).toBe("string");
    expect(typeof result2).toBe("string");
    // Each call should return a unique session ID (contains Date.now())
    // They may be equal if called in the same ms, so just check they're strings
    expect((result1 as string).startsWith("mock-session-")).toBe(true);
    expect((result2 as string).startsWith("mock-session-")).toBe(true);
  });
});
