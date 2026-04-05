import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useConversationStore } from "@/stores/conversation";
import { PermissionDialog } from "../permissions/PermissionDialog";

// Mock useClaude hook
const mockRespondPermission = vi.fn();
vi.mock("@/hooks/useClaude", () => ({
  useClaude: () => ({
    respondPermission: mockRespondPermission,
  }),
}));

function setPendingPermission(
  toolName: string,
  toolInput: Record<string, unknown>,
) {
  useConversationStore.setState({
    pendingPermission: {
      sessionId: "test-session",
      toolName,
      toolInput,
    },
  });
}

describe("PermissionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConversationStore.setState({
      pendingPermission: null,
      sessionAllowedTools: new Set(),
    });
  });

  it("renders nothing when no pending permission", () => {
    const { container } = render(<PermissionDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("shows dialog when pendingPermission is set", () => {
    setPendingPermission("Bash", { command: "ls -la" });
    render(<PermissionDialog />);

    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("Allow")).toBeInTheDocument();
    expect(screen.getByText("Deny")).toBeInTheDocument();
  });

  it("displays tool name prominently", () => {
    setPendingPermission("Edit", {
      file_path: "/src/main.ts",
      old_string: "x",
      new_string: "y",
    });
    render(<PermissionDialog />);

    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("shows bash command preview for Bash tool", () => {
    setPendingPermission("Bash", { command: "npm install express" });
    render(<PermissionDialog />);

    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getByText("npm install express")).toBeInTheDocument();
  });

  it("shows file path for Edit tool", () => {
    setPendingPermission("Edit", {
      file_path: "/src/main.ts",
      old_string: "const x = 1",
      new_string: "const x = 2",
    });
    render(<PermissionDialog />);

    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("/src/main.ts")).toBeInTheDocument();
  });

  it("shows file path and content for Write tool", () => {
    setPendingPermission("Write", {
      file_path: "/src/new.ts",
      content: "export const hello = 1;",
    });
    render(<PermissionDialog />);

    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("/src/new.ts")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("shows JSON preview for unknown tools", () => {
    setPendingPermission("CustomTool", { foo: "bar", count: 42 });
    render(<PermissionDialog />);

    expect(screen.getByText("Input")).toBeInTheDocument();
  });

  it("calls respondPermission(true) when Allow is clicked", async () => {
    const user = userEvent.setup();
    setPendingPermission("Bash", { command: "echo hello" });
    render(<PermissionDialog />);

    await user.click(screen.getByText("Allow"));
    expect(mockRespondPermission).toHaveBeenCalledWith(true);
  });

  it("calls respondPermission(false) when Deny is clicked", async () => {
    const user = userEvent.setup();
    setPendingPermission("Bash", { command: "echo hello" });
    render(<PermissionDialog />);

    await user.click(screen.getByText("Deny"));
    expect(mockRespondPermission).toHaveBeenCalledWith(false);
  });

  it("calls respondPermission(true) when Allow for Session is clicked and tracks the tool", async () => {
    const user = userEvent.setup();
    setPendingPermission("Bash", { command: "echo hello" });
    render(<PermissionDialog />);

    await user.click(screen.getByText("Allow for Session"));
    expect(mockRespondPermission).toHaveBeenCalledWith(true);
    // Verify the tool is now tracked in sessionAllowedTools
    expect(
      useConversationStore.getState().sessionAllowedTools.has("Bash"),
    ).toBe(true);
  });

  // ── Risk level classification ─────────────────────────────────────────

  it("shows 'Safe' label for read-only tools", () => {
    setPendingPermission("Read", { file_path: "/src/main.ts" });
    render(<PermissionDialog />);

    expect(screen.getByText("Safe")).toBeInTheDocument();
  });

  it("shows 'Write' label for Edit tool", () => {
    setPendingPermission("Edit", {
      file_path: "/src/main.ts",
      old_string: "a",
      new_string: "b",
    });
    render(<PermissionDialog />);

    expect(screen.getByText("Write")).toBeInTheDocument();
  });

  it("shows 'Destructive' label for dangerous bash commands", () => {
    setPendingPermission("Bash", { command: "rm -rf /tmp/project" });
    render(<PermissionDialog />);

    expect(screen.getByText("Destructive")).toBeInTheDocument();
  });

  it("shows 'Write' label for normal bash commands", () => {
    setPendingPermission("Bash", { command: "echo hello" });
    render(<PermissionDialog />);

    expect(screen.getByText("Write")).toBeInTheDocument();
  });

  it("shows 'Unknown' label for unrecognized tools", () => {
    setPendingPermission("SomeNewTool", { data: "test" });
    render(<PermissionDialog />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows 'Destructive' for git push --force", () => {
    setPendingPermission("Bash", { command: "git push --force origin main" });
    render(<PermissionDialog />);

    expect(screen.getByText("Destructive")).toBeInTheDocument();
  });

  it("shows keyboard shortcut badges (Y, S, N)", () => {
    setPendingPermission("Bash", { command: "echo test" });
    render(<PermissionDialog />);

    expect(screen.getByText("Y")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("shows 'permission required' text", () => {
    setPendingPermission("Bash", { command: "echo test" });
    render(<PermissionDialog />);

    expect(screen.getByText("permission required")).toBeInTheDocument();
  });
});
