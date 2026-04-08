import { Loader2 } from "lucide-react";

/**
 * Shared spinning loader component.
 *
 * Replaces the repeated `<Loader2 className="animate-spin" />` pattern
 * used across 20+ files in the codebase.
 */
export function Spinner({
  size = 14,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Loader2
      size={size}
      className={`animate-spin ${className}`.trim()}
      style={style}
    />
  );
}
