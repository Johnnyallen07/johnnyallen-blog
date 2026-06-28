import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_COLOR_SWATCHES,
  EDITOR_SHORTCUTS,
  findEditorShortcut,
  formatShortcutLabel,
} from "./editor-shortcuts.js";

test("defines expected editor shortcuts", () => {
  assert.equal(findEditorShortcut("undo")?.key, "Mod-z");
  assert.equal(findEditorShortcut("redo")?.key, "Mod-Shift-z");
  assert.equal(findEditorShortcut("bold")?.key, "Mod-b");
  assert.equal(findEditorShortcut("italic")?.key, "Mod-i");
  assert.equal(findEditorShortcut("underline")?.key, "Mod-u");
  assert.equal(findEditorShortcut("strike")?.key, "Mod-Shift-x");
  assert.equal(findEditorShortcut("heading-1")?.key, "Mod-Alt-1");
  assert.equal(findEditorShortcut("heading-2")?.key, "Mod-Alt-2");
  assert.equal(findEditorShortcut("heading-3")?.key, "Mod-Alt-3");
  assert.equal(findEditorShortcut("ordered-list")?.key, "Mod-Shift-7");
  assert.equal(findEditorShortcut("bullet-list")?.key, "Mod-Shift-8");
  assert.equal(findEditorShortcut("link")?.key, "Mod-k");
  assert.equal(findEditorShortcut("save")?.key, "Mod-s");

  assert.equal(EDITOR_SHORTCUTS.length, new Set(EDITOR_SHORTCUTS.map((shortcut) => shortcut.id)).size);
});

test("formats shortcut labels for macOS and non-mac platforms", () => {
  assert.equal(formatShortcutLabel("Mod-Shift-x", "mac"), "⌘⇧X");
  assert.equal(formatShortcutLabel("Mod-Alt-3", "mac"), "⌘⌥3");
  assert.equal(formatShortcutLabel("Mod-Shift-8", "windows"), "Ctrl+Shift+8");
});

test("defines a practical text color palette with reset support", () => {
  assert.ok(EDITOR_COLOR_SWATCHES.length >= 8);
  assert.equal(EDITOR_COLOR_SWATCHES[0]?.value, null);
  assert.ok(EDITOR_COLOR_SWATCHES.some((swatch) => swatch.value === "#dc2626"));
  assert.ok(EDITOR_COLOR_SWATCHES.some((swatch) => swatch.value === "#2563eb"));
});
