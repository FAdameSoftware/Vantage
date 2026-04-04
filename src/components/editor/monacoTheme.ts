import type { editor } from "monaco-editor";

/**
 * Catppuccin Mocha theme for Monaco Editor.
 * Maps the CSS custom property hex values directly since Monaco requires
 * hex color strings, not CSS variable references.
 */
export const catppuccinMochaTheme: editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    // Keywords: if, else, return, const, let, function, class, import, export
    { token: "keyword", foreground: "cba6f7" }, // mauve
    { token: "keyword.control", foreground: "cba6f7" },
    { token: "keyword.operator", foreground: "89dceb" }, // sky

    // Strings
    { token: "string", foreground: "a6e3a1" }, // green
    { token: "string.escape", foreground: "f5c2e7" }, // pink

    // Numbers
    { token: "number", foreground: "fab387" }, // peach
    { token: "number.float", foreground: "fab387" },
    { token: "number.hex", foreground: "fab387" },

    // Comments
    { token: "comment", foreground: "6c7086", fontStyle: "italic" }, // overlay-0
    { token: "comment.block", foreground: "6c7086", fontStyle: "italic" },

    // Functions
    { token: "entity.name.function", foreground: "89b4fa" }, // blue
    { token: "support.function", foreground: "89b4fa" },

    // Types and classes
    { token: "entity.name.type", foreground: "f9e2af" }, // yellow
    { token: "entity.name.class", foreground: "f9e2af" },
    { token: "support.type", foreground: "f9e2af" },
    { token: "type", foreground: "f9e2af" },

    // Variables
    { token: "variable", foreground: "cdd6f4" }, // text
    { token: "variable.parameter", foreground: "eba0ac" }, // maroon
    { token: "variable.other", foreground: "cdd6f4" },

    // Constants
    { token: "constant", foreground: "fab387" }, // peach
    { token: "constant.language", foreground: "fab387" },
    { token: "constant.numeric", foreground: "fab387" },

    // Operators
    { token: "operator", foreground: "89dceb" }, // sky
    { token: "keyword.operator", foreground: "89dceb" },

    // Properties
    { token: "variable.property", foreground: "b4befe" }, // lavender
    { token: "support.variable.property", foreground: "b4befe" },

    // Decorators / annotations
    { token: "meta.decorator", foreground: "cba6f7" }, // mauve

    // Tags (HTML, JSX)
    { token: "tag", foreground: "89b4fa" }, // blue
    { token: "metatag", foreground: "89b4fa" },

    // Attributes
    { token: "attribute.name", foreground: "f9e2af" }, // yellow
    { token: "attribute.value", foreground: "a6e3a1" }, // green

    // Regex
    { token: "regexp", foreground: "fab387" }, // peach

    // Invalid / error
    { token: "invalid", foreground: "f38ba8" }, // red

    // Punctuation
    { token: "delimiter", foreground: "9399b2" }, // overlay-2
    { token: "delimiter.bracket", foreground: "9399b2" },

    // Markdown
    { token: "markup.heading", foreground: "89b4fa", fontStyle: "bold" },
    { token: "markup.bold", fontStyle: "bold" },
    { token: "markup.italic", fontStyle: "italic" },
    { token: "markup.underline", fontStyle: "underline" },

    // JSON keys
    { token: "string.key.json", foreground: "89b4fa" },
    { token: "string.value.json", foreground: "a6e3a1" },

    // TOML
    { token: "type.identifier.toml", foreground: "89b4fa" },

    // CSS
    { token: "attribute.name.css", foreground: "b4befe" },
    { token: "attribute.value.css", foreground: "a6e3a1" },
  ],
  colors: {
    // Editor background and foreground
    "editor.background": "#1e1e2e",
    "editor.foreground": "#cdd6f4",

    // Selection
    "editor.selectionBackground": "#45475a80",
    "editor.inactiveSelectionBackground": "#45475a40",
    "editor.selectionHighlightBackground": "#45475a60",

    // Cursor
    "editorCursor.foreground": "#f5e0dc",

    // Line highlight
    "editor.lineHighlightBackground": "#31324420",
    "editor.lineHighlightBorder": "#31324400",

    // Line numbers
    "editorLineNumber.foreground": "#585b70",
    "editorLineNumber.activeForeground": "#cdd6f4",

    // Indent guides
    "editorIndentGuide.background": "#31324480",
    "editorIndentGuide.activeBackground": "#45475a",

    // Brackets
    "editorBracketMatch.background": "#45475a40",
    "editorBracketMatch.border": "#89b4fa80",

    // Whitespace
    "editorWhitespace.foreground": "#31324480",

    // Gutter
    "editorGutter.background": "#1e1e2e",

    // Minimap
    "minimap.background": "#181825",
    "minimapSlider.background": "#45475a40",
    "minimapSlider.hoverBackground": "#45475a60",
    "minimapSlider.activeBackground": "#45475a80",

    // Scrollbar
    "scrollbarSlider.background": "#45475a40",
    "scrollbarSlider.hoverBackground": "#45475a80",
    "scrollbarSlider.activeBackground": "#45475aA0",

    // Widget (find/replace, etc.)
    "editorWidget.background": "#181825",
    "editorWidget.border": "#313244",

    // Suggest / autocomplete popup
    "editorSuggestWidget.background": "#181825",
    "editorSuggestWidget.border": "#313244",
    "editorSuggestWidget.selectedBackground": "#313244",
    "editorSuggestWidget.highlightForeground": "#89b4fa",

    // Hover
    "editorHoverWidget.background": "#181825",
    "editorHoverWidget.border": "#313244",

    // Peek view
    "peekView.border": "#89b4fa",
    "peekViewEditor.background": "#181825",
    "peekViewResult.background": "#181825",

    // Overview ruler
    "editorOverviewRuler.border": "#313244",

    // Find match highlighting
    "editor.findMatchBackground": "#f9e2af40",
    "editor.findMatchHighlightBackground": "#f9e2af20",
  },
};
