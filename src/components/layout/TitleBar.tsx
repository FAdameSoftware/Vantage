export function TitleBar() {
  return (
    <div
      className="flex items-center justify-center h-8 shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
      data-tauri-drag-region
    >
      <span className="text-xs font-medium" style={{ color: "var(--color-subtext-0)" }}>
        Vantage
      </span>
    </div>
  );
}
