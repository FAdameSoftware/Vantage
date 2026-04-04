import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../editor";

describe("editorStore", () => {
  beforeEach(() => {
    // Reset store between tests
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      cursorPosition: { line: 1, column: 1 },
    });
  });

  it("opens a file and sets it as active", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/src/main.ts", "main.ts", "typescript", "const x = 1;");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].name).toBe("main.ts");
    expect(state.tabs[0].isDirty).toBe(false);
    expect(state.activeTabId).toBe("c:/project/src/main.ts");
  });

  it("switches to existing tab if file is already open", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b");
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("c:/project/a.ts");
  });

  it("marks tab dirty when content changes", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "const x = 1;");

    store.updateContent("c:/project/main.ts", "const x = 2;");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isDirty).toBe(true);
  });

  it("clears dirty state when content matches saved", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "const x = 1;");
    store.updateContent("c:/project/main.ts", "const x = 2;");
    store.updateContent("c:/project/main.ts", "const x = 1;");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isDirty).toBe(false);
  });

  it("marks saved resets dirty state", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/main.ts", "main.ts", "typescript", "original");
    store.updateContent("c:/project/main.ts", "modified");
    store.markSaved("c:/project/main.ts", "modified");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isDirty).toBe(false);
    expect(state.tabs[0].savedContent).toBe("modified");
  });

  it("closes a tab and selects the neighbor", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b");
    store.openFile("C:/project/c.ts", "c.ts", "typescript", "c");

    // Active is c.ts; close it
    store.closeTab("c:/project/c.ts");

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe("c:/project/b.ts");
  });

  it("replaces preview tab when opening another preview", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a", true);
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b", true);

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].name).toBe("b.ts");
    expect(state.tabs[0].isPreview).toBe(true);
  });

  it("pins a preview tab", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a", true);
    store.pinTab("c:/project/a.ts");

    const state = useEditorStore.getState();
    expect(state.tabs[0].isPreview).toBe(false);
  });

  it("normalizes backslash paths", () => {
    const store = useEditorStore.getState();
    store.openFile("C:\\project\\main.ts", "main.ts", "typescript", "content");

    const state = useEditorStore.getState();
    expect(state.tabs[0].path).toBe("C:/project/main.ts");
    expect(state.activeTabId).toBe("c:/project/main.ts");
  });

  it("returns null for getActiveTab when no tabs open", () => {
    const state = useEditorStore.getState();
    expect(state.getActiveTab()).toBeNull();
  });

  it("closeAllTabs clears everything", () => {
    const store = useEditorStore.getState();
    store.openFile("C:/project/a.ts", "a.ts", "typescript", "a");
    store.openFile("C:/project/b.ts", "b.ts", "typescript", "b");
    store.closeAllTabs();

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });
});
