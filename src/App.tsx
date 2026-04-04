function App() {
  return (
    <div
      className="h-screen w-screen flex flex-col gap-2 p-4"
      style={{ backgroundColor: "var(--color-base)", color: "var(--color-text)" }}
    >
      <div className="flex gap-2">
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-crust)" }} title="crust" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-mantle)" }} title="mantle" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-base)" }} title="base" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-surface-0)" }} title="surface-0" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-surface-1)" }} title="surface-1" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-surface-2)" }} title="surface-2" />
      </div>
      <div className="flex gap-4 text-sm">
        <span style={{ color: "var(--color-blue)" }}>Blue</span>
        <span style={{ color: "var(--color-green)" }}>Green</span>
        <span style={{ color: "var(--color-red)" }}>Red</span>
        <span style={{ color: "var(--color-yellow)" }}>Yellow</span>
        <span style={{ color: "var(--color-mauve)" }}>Mauve</span>
        <span style={{ color: "var(--color-peach)" }}>Peach</span>
        <span style={{ color: "var(--color-teal)" }}>Teal</span>
        <span style={{ color: "var(--color-lavender)" }}>Lavender</span>
      </div>
      <p style={{ color: "var(--color-text)" }}>Primary text -- color-text</p>
      <p style={{ color: "var(--color-subtext-1)" }}>Secondary text -- color-subtext-1</p>
      <p style={{ color: "var(--color-subtext-0)" }}>Tertiary text -- color-subtext-0</p>
    </div>
  );
}

export default App;
