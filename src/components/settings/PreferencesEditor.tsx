import { useState, useMemo, useCallback } from "react";
import {
  Search,
  RotateCcw,
  Palette,
  Type,
  Terminal,
  MessageSquare,
  Users,
} from "lucide-react";
import { useSettingsStore, type ThemeName } from "@/stores/settings";

// ─── Setting definitions ────────────────────────────────────────────────────

type SettingControl =
  | { type: "toggle"; key: string }
  | { type: "dropdown"; key: string; options: { value: string; label: string }[] }
  | { type: "number"; key: string; min: number; max: number; step?: number };

interface SettingDef {
  id: string;
  label: string;
  description: string;
  category: string;
  control: SettingControl;
  defaultValue: unknown;
}

const SETTING_DEFINITIONS: SettingDef[] = [
  // ── Appearance ──
  {
    id: "theme",
    label: "Theme",
    description: "Color theme for the IDE",
    category: "Appearance",
    control: {
      type: "dropdown",
      key: "theme",
      options: [
        { value: "vantage-dark", label: "Dark (Catppuccin Mocha)" },
        { value: "vantage-light", label: "Light (Catppuccin Latte)" },
        { value: "vantage-high-contrast", label: "High Contrast" },
      ],
    },
    defaultValue: "vantage-dark",
  },
  {
    id: "fontSizeUI",
    label: "UI Font Size",
    description: "Font size for the general interface",
    category: "Appearance",
    control: { type: "number", key: "fontSizeUI", min: 10, max: 24, step: 1 },
    defaultValue: 13,
  },
  {
    id: "showBuddy",
    label: "Show Buddy (Inkwell)",
    description: "Show the Inkwell turtle companion in the status bar",
    category: "Appearance",
    control: { type: "toggle", key: "showBuddy" },
    defaultValue: true,
  },

  // ── Editor ──
  {
    id: "fontSizeEditor",
    label: "Editor Font Size",
    description: "Font size for the code editor",
    category: "Editor",
    control: { type: "number", key: "fontSizeEditor", min: 8, max: 32, step: 1 },
    defaultValue: 14,
  },
  {
    id: "tabSize",
    label: "Tab Size",
    description: "Number of spaces per tab",
    category: "Editor",
    control: { type: "number", key: "tabSize", min: 1, max: 8, step: 1 },
    defaultValue: 2,
  },
  {
    id: "insertSpaces",
    label: "Insert Spaces",
    description: "Use spaces instead of tabs for indentation",
    category: "Editor",
    control: { type: "toggle", key: "insertSpaces" },
    defaultValue: true,
  },
  {
    id: "wordWrap",
    label: "Word Wrap",
    description: "Wrap long lines in the editor",
    category: "Editor",
    control: { type: "toggle", key: "wordWrap" },
    defaultValue: false,
  },
  {
    id: "wordWrapColumn",
    label: "Word Wrap Column",
    description: "Column at which wrapped lines break (when word wrap is on)",
    category: "Editor",
    control: { type: "number", key: "wordWrapColumn", min: 20, max: 500, step: 1 },
    defaultValue: 80,
  },
  {
    id: "stickyScroll",
    label: "Sticky Scroll",
    description: "Pin enclosing scope headers to the top while scrolling",
    category: "Editor",
    control: { type: "toggle", key: "stickyScroll" },
    defaultValue: true,
  },
  {
    id: "cursorBlinking",
    label: "Cursor Blink Style",
    description: "Animation style for the editor cursor",
    category: "Editor",
    control: {
      type: "dropdown",
      key: "cursorBlinking",
      options: [
        { value: "blink", label: "Blink" },
        { value: "smooth", label: "Smooth" },
        { value: "expand", label: "Expand" },
        { value: "solid", label: "Solid (no blink)" },
        { value: "phase", label: "Phase (fade)" },
      ],
    },
    defaultValue: "blink",
  },
  {
    id: "minimap",
    label: "Minimap",
    description: "Show the code minimap on the right side of the editor",
    category: "Editor",
    control: { type: "toggle", key: "minimap" },
    defaultValue: true,
  },
  {
    id: "lineNumbers",
    label: "Line Numbers",
    description: "Show line numbers in the editor gutter",
    category: "Editor",
    control: { type: "toggle", key: "lineNumbers" },
    defaultValue: true,
  },
  {
    id: "vimMode",
    label: "Vim Mode",
    description: "Enable Vim keybindings in the editor",
    category: "Editor",
    control: { type: "toggle", key: "vimMode" },
    defaultValue: false,
  },
  {
    id: "formatOnSave",
    label: "Format on Save",
    description: "Automatically format files when saving (via Prettier)",
    category: "Editor",
    control: { type: "toggle", key: "formatOnSave" },
    defaultValue: false,
  },

  // ── Terminal ──
  {
    id: "terminalFontSize",
    label: "Terminal Font Size",
    description: "Font size for the integrated terminal",
    category: "Terminal",
    control: { type: "number", key: "terminalFontSize", min: 8, max: 32, step: 1 },
    defaultValue: 14,
  },

  // ── Chat ──
  {
    id: "effortLevel",
    label: "Effort Level",
    description: "Claude reasoning depth (low, medium, high)",
    category: "Chat",
    control: {
      type: "dropdown",
      key: "effortLevel",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
    defaultValue: "high",
  },
  {
    id: "planMode",
    label: "Plan Mode",
    description: "Start sessions in read-only plan mode (Claude proposes, doesn't apply)",
    category: "Chat",
    control: { type: "toggle", key: "planMode" },
    defaultValue: false,
  },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Appearance: <Palette size={14} />,
  Editor: <Type size={14} />,
  Terminal: <Terminal size={14} />,
  Chat: <MessageSquare size={14} />,
  Agents: <Users size={14} />,
};

const CATEGORIES = ["Appearance", "Editor", "Terminal", "Chat"];

// ─── Individual setting controls ────────────────────────────────────────────

function ToggleControl({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative w-8 h-4 rounded-full transition-colors"
      style={{
        backgroundColor: value ? "var(--color-blue)" : "var(--color-surface-1)",
      }}
    >
      <span
        className="absolute top-0.5 w-3 h-3 rounded-full transition-transform"
        style={{
          backgroundColor: "var(--color-text)",
          left: value ? "calc(100% - 14px)" : "2px",
        }}
      />
    </button>
  );
}

function DropdownControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs px-2 py-1 rounded outline-none cursor-pointer"
      style={{
        backgroundColor: "var(--color-surface-0)",
        color: "var(--color-text)",
        border: "1px solid var(--color-surface-1)",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function NumberControl({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      className="w-16 text-xs px-2 py-1 rounded outline-none"
      style={{
        backgroundColor: "var(--color-surface-0)",
        color: "var(--color-text)",
        border: "1px solid var(--color-surface-1)",
      }}
    />
  );
}

// ─── Setting row ────────────────────────────────────────────────────────────

function SettingRow({
  setting,
  currentValue,
  onUpdate,
  onReset,
  isDefault,
  searchQuery,
}: {
  setting: SettingDef;
  currentValue: unknown;
  onUpdate: (value: unknown) => void;
  onReset: () => void;
  isDefault: boolean;
  searchQuery: string;
}) {
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark
          style={{
            backgroundColor: "var(--color-yellow)",
            color: "var(--color-base)",
            borderRadius: "2px",
            padding: "0 1px",
          }}
        >
          {text.slice(idx, idx + searchQuery.length)}
        </mark>
        {text.slice(idx + searchQuery.length)}
      </>
    );
  };

  return (
    <div
      className="flex items-center justify-between py-2 px-3 rounded transition-colors hover:bg-[var(--color-surface-0)]"
      style={{ borderBottom: "1px solid var(--color-surface-0)" }}
    >
      <div className="flex-1 mr-4">
        <div className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
          {highlightText(setting.label)}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: "var(--color-overlay-1)" }}>
          {highlightText(setting.description)}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {setting.control.type === "toggle" && (
          <ToggleControl
            value={currentValue as boolean}
            onChange={(v) => onUpdate(v)}
          />
        )}
        {setting.control.type === "dropdown" && (
          <DropdownControl
            value={currentValue as string}
            options={setting.control.options}
            onChange={(v) => onUpdate(v)}
          />
        )}
        {setting.control.type === "number" && (
          <NumberControl
            value={currentValue as number}
            min={setting.control.min}
            max={setting.control.max}
            step={setting.control.step ?? 1}
            onChange={(v) => onUpdate(v)}
          />
        )}
        {!isDefault && (
          <button
            type="button"
            onClick={onReset}
            className="p-1 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label={`Reset ${setting.label} to default`}
            title="Reset to default"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Preferences Editor ─────────────────────────────────────────────────────

export function PreferencesEditor() {
  const [searchQuery, setSearchQuery] = useState("");
  const settings = useSettingsStore();

  // Build a map of current values by key
  const valueMap: Record<string, unknown> = useMemo(
    () => ({
      theme: settings.theme,
      fontSizeEditor: settings.fontSizeEditor,
      fontSizeUI: settings.fontSizeUI,
      tabSize: settings.tabSize,
      insertSpaces: settings.insertSpaces,
      wordWrap: settings.wordWrap,
      wordWrapColumn: settings.wordWrapColumn,
      minimap: settings.minimap,
      lineNumbers: settings.lineNumbers,
      vimMode: settings.vimMode,
      formatOnSave: settings.formatOnSave,
      terminalFontSize: settings.terminalFontSize,
      showBuddy: settings.showBuddy,
      effortLevel: settings.effortLevel,
      planMode: settings.planMode,
      stickyScroll: settings.stickyScroll,
      cursorBlinking: settings.cursorBlinking,
    }),
    [settings],
  );

  // Map of setter functions by key
  const setterMap: Record<string, (value: unknown) => void> = useMemo(
    () => ({
      theme: (v) => settings.setTheme(v as ThemeName),
      fontSizeEditor: (v) => settings.setFontSizeEditor(v as number),
      fontSizeUI: (v) => settings.setFontSizeUI(v as number),
      tabSize: (v) => settings.setTabSize(v as number),
      insertSpaces: (v) => settings.setInsertSpaces(v as boolean),
      wordWrap: (v) => settings.setWordWrap(v as boolean),
      wordWrapColumn: (v) => settings.setWordWrapColumn(v as number),
      minimap: (v) => settings.setMinimap(v as boolean),
      lineNumbers: (v) => settings.setLineNumbers(v as boolean),
      vimMode: (v) => settings.setVimMode(v as boolean),
      formatOnSave: (v) => settings.setFormatOnSave(v as boolean),
      terminalFontSize: (v) => settings.setTerminalFontSize(v as number),
      showBuddy: () => settings.toggleBuddy(),
      effortLevel: (v) => settings.setEffortLevel(v as "low" | "medium" | "high"),
      planMode: (v) => settings.setPlanMode(v as boolean),
      stickyScroll: (v) => settings.setStickyScroll(v as boolean),
      cursorBlinking: (v) => settings.setCursorBlinking(v as "blink" | "smooth" | "expand" | "solid" | "phase"),
    }),
    [settings],
  );

  const filteredSettings = useMemo(() => {
    if (!searchQuery.trim()) return SETTING_DEFINITIONS;
    const lq = searchQuery.toLowerCase();
    return SETTING_DEFINITIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(lq) ||
        s.description.toLowerCase().includes(lq) ||
        s.category.toLowerCase().includes(lq),
    );
  }, [searchQuery]);

  const handleUpdate = useCallback(
    (key: string, value: unknown) => {
      const setter = setterMap[key];
      if (setter) setter(value);
    },
    [setterMap],
  );

  const handleReset = useCallback(
    (setting: SettingDef) => {
      const setter = setterMap[setting.control.key];
      if (setter) setter(setting.defaultValue);
    },
    [setterMap],
  );

  // Group filtered settings by category
  const grouped = useMemo(() => {
    const groups: Record<string, SettingDef[]> = {};
    for (const cat of CATEGORIES) {
      const items = filteredSettings.filter((s) => s.category === cat);
      if (items.length > 0) groups[cat] = items;
    }
    return groups;
  }, [filteredSettings]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search */}
      <div
        className="flex items-center gap-2 px-3 h-9 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <Search size={12} style={{ color: "var(--color-overlay-1)" }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings..."
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-overlay-0)]"
          style={{ color: "var(--color-text)" }}
        />
        {searchQuery && (
          <span className="text-[10px]" style={{ color: "var(--color-overlay-1)" }}>
            {filteredSettings.length} result{filteredSettings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Settings list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-4">
            <div
              className="flex items-center gap-2 px-3 py-1.5 mb-1"
              style={{ color: "var(--color-subtext-0)" }}
            >
              {CATEGORY_ICONS[category]}
              <span className="text-xs font-semibold uppercase tracking-wider">
                {category}
              </span>
            </div>
            {items.map((setting) => {
              const currentValue = valueMap[setting.control.key];
              const isDefault = currentValue === setting.defaultValue;
              return (
                <SettingRow
                  key={setting.id}
                  setting={setting}
                  currentValue={currentValue}
                  onUpdate={(v) => handleUpdate(setting.control.key, v)}
                  onReset={() => handleReset(setting)}
                  isDefault={isDefault}
                  searchQuery={searchQuery}
                />
              );
            })}
          </div>
        ))}

        {filteredSettings.length === 0 && (
          <div
            className="flex items-center justify-center h-32 text-xs"
            style={{ color: "var(--color-overlay-1)" }}
          >
            No settings match &quot;{searchQuery}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
