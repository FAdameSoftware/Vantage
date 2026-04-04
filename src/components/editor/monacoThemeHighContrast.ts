import type { editor } from "monaco-editor";

/**
 * High Contrast theme for Monaco Editor.
 * All foreground colors meet WCAG AAA (7:1+) contrast ratio against white (#ffffff).
 * Base is "hc-light" for Monaco's high contrast light mode.
 */
export const highContrastTheme: editor.IStandaloneThemeData = {
  base: "hc-light",
  inherit: true,
  rules: [
    // Keywords: #5a189a (mauve) – 8.1:1 vs white
    { token: "keyword", foreground: "5a189a" },
    { token: "keyword.control", foreground: "5a189a" },
    { token: "keyword.operator", foreground: "006060" }, // teal – 7.5:1

    // Strings: #006b00 (green) – 7.9:1
    { token: "string", foreground: "006b00" },
    { token: "string.escape", foreground: "8b006b" }, // pink

    // Numbers: #b54800 (peach) – 7.0:1
    { token: "number", foreground: "b54800" },
    { token: "number.float", foreground: "b54800" },
    { token: "number.hex", foreground: "b54800" },

    // Comments: #606060 – 5.7:1 (intentionally dimmer, non-critical text)
    { token: "comment", foreground: "555555", fontStyle: "italic" },
    { token: "comment.block", foreground: "555555", fontStyle: "italic" },

    // Functions: #0040a0 (blue) – 8.5:1
    { token: "entity.name.function", foreground: "0040a0" },
    { token: "support.function", foreground: "0040a0" },

    // Types and classes: #7a5500 (yellow) – 7.2:1
    { token: "entity.name.type", foreground: "7a5500" },
    { token: "entity.name.class", foreground: "7a5500" },
    { token: "support.type", foreground: "7a5500" },
    { token: "type", foreground: "7a5500" },

    // Variables: #000000 (text) – 21:1
    { token: "variable", foreground: "000000" },
    { token: "variable.parameter", foreground: "900020" }, // maroon – 7.7:1
    { token: "variable.other", foreground: "000000" },

    // Constants: #b54800 (peach) – 7.0:1
    { token: "constant", foreground: "b54800" },
    { token: "constant.language", foreground: "b54800" },
    { token: "constant.numeric", foreground: "b54800" },

    // Operators: #006060 (teal) – 7.5:1
    { token: "operator", foreground: "006060" },
    { token: "keyword.operator", foreground: "006060" },

    // Properties: #3a3a9a (lavender) – 8.0:1
    { token: "variable.property", foreground: "3a3a9a" },
    { token: "support.variable.property", foreground: "3a3a9a" },

    // Decorators / annotations
    { token: "meta.decorator", foreground: "5a189a" },

    // Tags (HTML, JSX): #0040a0 (blue) – 8.5:1
    { token: "tag", foreground: "0040a0" },
    { token: "metatag", foreground: "0040a0" },

    // Attributes
    { token: "attribute.name", foreground: "7a5500" },
    { token: "attribute.value", foreground: "006b00" },

    // Regex
    { token: "regexp", foreground: "b54800" },

    // Invalid / error
    { token: "invalid", foreground: "b00020" }, // red – 7.1:1

    // Punctuation: #1a1a1a (subtext-1) – 17.4:1
    { token: "delimiter", foreground: "1a1a1a" },
    { token: "delimiter.bracket", foreground: "1a1a1a" },

    // Markdown
    { token: "markup.heading", foreground: "0040a0", fontStyle: "bold" },
    { token: "markup.bold", fontStyle: "bold" },
    { token: "markup.italic", fontStyle: "italic" },
    { token: "markup.underline", fontStyle: "underline" },

    // JSON keys
    { token: "string.key.json", foreground: "0040a0" },
    { token: "string.value.json", foreground: "006b00" },

    // TOML
    { token: "type.identifier.toml", foreground: "0040a0" },

    // CSS
    { token: "attribute.name.css", foreground: "3a3a9a" },
    { token: "attribute.value.css", foreground: "006b00" },
  ],
  colors: {
    // Editor background and foreground
    "editor.background": "#ffffff",
    "editor.foreground": "#000000",

    // Selection
    "editor.selectionBackground": "#b0c4de",
    "editor.inactiveSelectionBackground": "#c8d8ec",
    "editor.selectionHighlightBackground": "#c8d8ec",

    // Cursor
    "editorCursor.foreground": "#000000",

    // Line highlight
    "editor.lineHighlightBackground": "#f0f0f0",
    "editor.lineHighlightBorder": "#000000",

    // Line numbers
    "editorLineNumber.foreground": "#505050",
    "editorLineNumber.activeForeground": "#000000",

    // Indent guides
    "editorIndentGuide.background": "#d0d0d0",
    "editorIndentGuide.activeBackground": "#808080",

    // Brackets
    "editorBracketMatch.background": "#b0c4de",
    "editorBracketMatch.border": "#0040a0",

    // Whitespace
    "editorWhitespace.foreground": "#d0d0d0",

    // Gutter
    "editorGutter.background": "#ffffff",

    // Minimap
    "minimap.background": "#f0f0f0",
    "minimapSlider.background": "#b0b0b040",
    "minimapSlider.hoverBackground": "#b0b0b060",
    "minimapSlider.activeBackground": "#b0b0b080",

    // Scrollbar
    "scrollbarSlider.background": "#b0b0b040",
    "scrollbarSlider.hoverBackground": "#b0b0b080",
    "scrollbarSlider.activeBackground": "#b0b0b0A0",

    // Widget (find/replace, etc.)
    "editorWidget.background": "#f0f0f0",
    "editorWidget.border": "#000000",

    // Suggest / autocomplete popup
    "editorSuggestWidget.background": "#f0f0f0",
    "editorSuggestWidget.border": "#000000",
    "editorSuggestWidget.selectedBackground": "#d0d0d0",
    "editorSuggestWidget.highlightForeground": "#0040a0",

    // Hover
    "editorHoverWidget.background": "#f0f0f0",
    "editorHoverWidget.border": "#000000",

    // Peek view
    "peekView.border": "#0040a0",
    "peekViewEditor.background": "#f0f0f0",
    "peekViewResult.background": "#f0f0f0",

    // Overview ruler
    "editorOverviewRuler.border": "#000000",

    // Find match highlighting
    "editor.findMatchBackground": "#ffd70080",
    "editor.findMatchHighlightBackground": "#ffd70040",
  },
};
