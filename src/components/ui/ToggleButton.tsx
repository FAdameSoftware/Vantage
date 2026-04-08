import type { ReactNode, ButtonHTMLAttributes } from "react";

export interface ToggleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Whether the toggle is currently active */
  active: boolean;
  /** Click handler to toggle state */
  onClick: () => void;
  /** Accessible tooltip / aria-label text */
  title: string;
  /** Size variant: "sm" (24px) or "md" (28px) */
  size?: "sm" | "md";
  /** Active foreground color CSS variable (default: --color-blue) */
  activeColor?: string;
  children: ReactNode;
}

/**
 * A small, themed toggle button used for binary on/off options
 * (e.g., regex toggle, case-sensitive toggle, blocks visibility).
 */
export function ToggleButton({
  active,
  onClick,
  title,
  size = "sm",
  activeColor = "var(--color-blue)",
  children,
  className,
  ...rest
}: ToggleButtonProps) {
  const dim = size === "sm" ? "w-6 h-6" : "w-7 h-7";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`flex items-center justify-center rounded shrink-0 transition-colors ${dim} ${className ?? ""}`}
      style={{
        color: active ? activeColor : "var(--color-overlay-1)",
        backgroundColor: active ? "var(--color-surface-0)" : "transparent",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
