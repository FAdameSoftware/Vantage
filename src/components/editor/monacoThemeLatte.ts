import type { editor } from "monaco-editor";

/**
 * Catppuccin Latte theme for Monaco Editor.
 * The Latte palette is the official light variant of Catppuccin.
 * Base must be "vs" (light) since Latte is a light theme.
 */
export const catppuccinLatteTheme: editor.IStandaloneThemeData = {
  base: "vs",
  inherit: true,
  rules: [
    // Keywords: if, else, return, const, let, function, class, import, export
    { token: "keyword", foreground: "8839ef" }, // mauve
    { token: "keyword.control", foreground: "8839ef" },
    { token: "keyword.operator", foreground: "04a5e5" }, // sky

    // Strings
    { token: "string", foreground: "40a02b" }, // green
    { token: "string.escape", foreground: "ea76cb" }, // pink

    // Numbers
    { token: "number", foreground: "fe640b" }, // peach
    { token: "number.float", foreground: "fe640b" },
    { token: "number.hex", foreground: "fe640b" },

    // Comments
    { token: "comment", foreground: "9ca0b0", fontStyle: "italic" }, // overlay-0
    { token: "comment.block", foreground: "9ca0b0", fontStyle: "italic" },

    // Functions
    { token: "entity.name.function", foreground: "1e66f5" }, // blue
    { token: "support.function", foreground: "1e66f5" },

    // Types and classes
    { token: "entity.name.type", foreground: "df8e1d" }, // yellow
    { token: "entity.name.class", foreground: "df8e1d" },
    { token: "support.type", foreground: "df8e1d" },
    { token: "type", foreground: "df8e1d" },

    // Variables
    { token: "variable", foreground: "4c4f69" }, // text
    { token: "variable.parameter", foreground: "e64553" }, // maroon
    { token: "variable.other", foreground: "4c4f69" },

    // Constants
    { token: "constant", foreground: "fe640b" }, // peach
    { token: "constant.language", foreground: "fe640b" },
    { token: "constant.numeric", foreground: "fe640b" },

    // Operators
    { token: "operator", foreground: "04a5e5" }, // sky
    { token: "keyword.operator", foreground: "04a5e5" },

    // Properties
    { token: "variable.property", foreground: "7287fd" }, // lavender
    { token: "support.variable.property", foreground: "7287fd" },

    // Decorators / annotations
    { token: "meta.decorator", foreground: "8839ef" }, // mauve

    // Tags (HTML, JSX)
    { token: "tag", foreground: "1e66f5" }, // blue
    { token: "metatag", foreground: "1e66f5" },

    // Attributes
    { token: "attribute.name", foreground: "df8e1d" }, // yellow
    { token: "attribute.value", foreground: "40a02b" }, // green

    // Regex
    { token: "regexp", foreground: "fe640b" }, // peach

    // Invalid / error
    { token: "invalid", foreground: "d20f39" }, // red

    // Punctuation
    { token: "delimiter", foreground: "7c7f93" }, // overlay-2
    { token: "delimiter.bracket", foreground: "7c7f93" },

    // Markdown
    { token: "markup.heading", foreground: "1e66f5", fontStyle: "bold" },
    { token: "markup.bold", fontStyle: "bold" },
    { token: "markup.italic", fontStyle: "italic" },
    { token: "markup.underline", fontStyle: "underline" },

    // JSON keys
    { token: "string.key.json", foreground: "1e66f5" },
    { token: "string.value.json", foreground: "40a02b" },

    // TOML
    { token: "type.identifier.toml", foreground: "1e66f5" },

    // CSS
    { token: "attribute.name.css", foreground: "7287fd" },
    { token: "attribute.value.css", foreground: "40a02b" },
  ],
  colors: {
    // Editor background and foreground
    "editor.background": "#eff1f5",
    "editor.foreground": "#4c4f69",

    // Selection
    "editor.selectionBackground": "#acb0be80",
    "editor.inactiveSelectionBackground": "#acb0be40",
    "editor.selectionHighlightBackground": "#acb0be60",

    // Cursor
    "editorCursor.foreground": "#dc8a78",

    // Line highlight
    "editor.lineHighlightBackground": "#ccd0da40",
    "editor.lineHighlightBorder": "#ccd0da00",

    // Line numbers
    "editorLineNumber.foreground": "#acb0be",
    "editorLineNumber.activeForeground": "#4c4f69",

    // Indent guides
    "editorIndentGuide.background": "#ccd0da80",
    "editorIndentGuide.activeBackground": "#bcc0cc",

    // Brackets
    "editorBracketMatch.background": "#bcc0cc40",
    "editorBracketMatch.border": "#1e66f580",

    // Whitespace
    "editorWhitespace.foreground": "#ccd0da80",

    // Gutter
    "editorGutter.background": "#eff1f5",

    // Minimap
    "minimap.background": "#e6e9ef",
    "minimapSlider.background": "#bcc0cc40",
    "minimapSlider.hoverBackground": "#bcc0cc60",
    "minimapSlider.activeBackground": "#bcc0cc80",

    // Scrollbar
    "scrollbarSlider.background": "#bcc0cc40",
    "scrollbarSlider.hoverBackground": "#bcc0cc80",
    "scrollbarSlider.activeBackground": "#bcc0ccA0",

    // Widget (find/replace, etc.)
    "editorWidget.background": "#e6e9ef",
    "editorWidget.border": "#ccd0da",

    // Suggest / autocomplete popup
    "editorSuggestWidget.background": "#e6e9ef",
    "editorSuggestWidget.border": "#ccd0da",
    "editorSuggestWidget.selectedBackground": "#ccd0da",
    "editorSuggestWidget.highlightForeground": "#1e66f5",

    // Hover
    "editorHoverWidget.background": "#e6e9ef",
    "editorHoverWidget.border": "#ccd0da",

    // Peek view
    "peekView.border": "#1e66f5",
    "peekViewEditor.background": "#e6e9ef",
    "peekViewResult.background": "#e6e9ef",

    // Overview ruler
    "editorOverviewRuler.border": "#ccd0da",

    // Find match highlighting
    "editor.findMatchBackground": "#df8e1d40",
    "editor.findMatchHighlightBackground": "#df8e1d20",
  },
};
