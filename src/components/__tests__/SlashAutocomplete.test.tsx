import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlashAutocomplete } from "../chat/SlashAutocomplete";
import type { SlashCommand } from "@/lib/slashCommands";

const MOCK_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear conversation", source: "built-in", isSkill: false },
  { name: "help", description: "Show help info", source: "built-in", isSkill: false },
  { name: "compact", description: "Compact context", source: "built-in", isSkill: false },
  { name: "review", description: "Review code changes", source: "my-plugin", isSkill: true },
];

function defaultProps(overrides: Partial<Parameters<typeof SlashAutocomplete>[0]> = {}) {
  return {
    commands: MOCK_COMMANDS,
    query: "",
    selectedIndex: 0,
    onSelect: vi.fn(),
    visible: true,
    ...overrides,
  };
}

describe("SlashAutocomplete", () => {
  it("renders nothing when visible is false", () => {
    const { container } = render(<SlashAutocomplete {...defaultProps({ visible: false })} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when commands list is empty", () => {
    const { container } = render(<SlashAutocomplete {...defaultProps({ commands: [] })} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders all commands when visible with commands", () => {
    render(<SlashAutocomplete {...defaultProps()} />);

    expect(screen.getByText("/clear")).toBeInTheDocument();
    expect(screen.getByText("/help")).toBeInTheDocument();
    expect(screen.getByText("/compact")).toBeInTheDocument();
    expect(screen.getByText("/review")).toBeInTheDocument();
  });

  it("displays descriptions for each command", () => {
    render(<SlashAutocomplete {...defaultProps()} />);

    expect(screen.getByText("Clear conversation")).toBeInTheDocument();
    expect(screen.getByText("Show help info")).toBeInTheDocument();
  });

  it("highlights the selected index item", () => {
    const { container } = render(
      <SlashAutocomplete {...defaultProps({ selectedIndex: 1 })} />,
    );

    // The second item (index 1 = "help") should have the highlighted background
    const items = container.querySelectorAll("[class*='cursor-pointer']");
    expect(items[1]).toHaveStyle({ backgroundColor: "var(--color-surface-1)" });
    // First item should NOT have the highlighted background
    expect(items[0]).not.toHaveStyle({ backgroundColor: "var(--color-surface-1)" });
  });

  it("calls onSelect when a command is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SlashAutocomplete {...defaultProps({ onSelect })} />);

    await user.click(screen.getByText("/help"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(MOCK_COMMANDS[1]);
  });

  it("shows source badge for non-built-in commands (skills)", () => {
    render(<SlashAutocomplete {...defaultProps()} />);

    // "my-plugin" source badge should be visible for the skill
    expect(screen.getByText("my-plugin")).toBeInTheDocument();
  });

  it("does not show source badge for built-in commands", () => {
    render(
      <SlashAutocomplete
        {...defaultProps({
          commands: [MOCK_COMMANDS[0]], // only "clear" which is built-in
        })}
      />,
    );

    expect(screen.queryByText("built-in")).not.toBeInTheDocument();
  });

  it("applies skill color (mauve) for skill commands", () => {
    render(
      <SlashAutocomplete
        {...defaultProps({
          commands: [MOCK_COMMANDS[3]], // review is a skill
        })}
      />,
    );

    const nameEl = screen.getByText("/review");
    expect(nameEl).toHaveStyle({ color: "var(--color-mauve)" });
  });

  it("applies built-in color (blue) for built-in commands", () => {
    render(
      <SlashAutocomplete
        {...defaultProps({
          commands: [MOCK_COMMANDS[0]], // clear is built-in
        })}
      />,
    );

    const nameEl = screen.getByText("/clear");
    expect(nameEl).toHaveStyle({ color: "var(--color-blue)" });
  });
});
