export const EDITOR_SHORTCUTS = [
  { id: "undo", key: "Mod-z" },
  { id: "redo", key: "Mod-Shift-z" },
  { id: "bold", key: "Mod-b" },
  { id: "italic", key: "Mod-i" },
  { id: "underline", key: "Mod-u" },
  { id: "strike", key: "Mod-Shift-x" },
  { id: "heading-1", key: "Mod-Alt-1" },
  { id: "heading-2", key: "Mod-Alt-2" },
  { id: "heading-3", key: "Mod-Alt-3" },
  { id: "ordered-list", key: "Mod-Shift-7" },
  { id: "bullet-list", key: "Mod-Shift-8" },
  { id: "blockquote", key: "Mod-Shift-b" },
  { id: "code-block", key: "Mod-Alt-c" },
  { id: "link", key: "Mod-k" },
  { id: "save", key: "Mod-s" },
];

export const EDITOR_COLOR_SWATCHES = [
  { label: "默认", value: null },
  { label: "正文灰", value: "#374151" },
  { label: "深色", value: "#111827" },
  { label: "红色", value: "#dc2626" },
  { label: "橙色", value: "#ea580c" },
  { label: "黄色", value: "#ca8a04" },
  { label: "绿色", value: "#16a34a" },
  { label: "青色", value: "#0891b2" },
  { label: "蓝色", value: "#2563eb" },
  { label: "紫色", value: "#7c3aed" },
  { label: "粉色", value: "#db2777" },
];

export function findEditorShortcut(id) {
  return EDITOR_SHORTCUTS.find((shortcut) => shortcut.id === id);
}

export function getEditorShortcutKey(id) {
  return findEditorShortcut(id)?.key;
}

export function formatShortcutLabel(key, platform = "mac") {
  const isMac = platform === "mac";
  return key
    .split("-")
    .map((part) => {
      const normalized = part.toLowerCase();
      if (normalized === "mod") return isMac ? "⌘" : "Ctrl";
      if (normalized === "shift") return isMac ? "⇧" : "Shift";
      if (normalized === "alt") return isMac ? "⌥" : "Alt";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(isMac ? "" : "+");
}

export function getEditorShortcutLabel(id, platform = "mac") {
  const key = getEditorShortcutKey(id);
  return key ? formatShortcutLabel(key, platform) : "";
}
