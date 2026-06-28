import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { getEditorShortcutKey } from "./editor-shortcuts";

type ShortcutHandlers = Record<string, () => boolean>;

function addShortcut(
  shortcuts: ShortcutHandlers,
  id: string,
  handler: () => boolean,
) {
  const key = getEditorShortcutKey(id);
  if (key) shortcuts[key] = handler;
}

export function setEditorLink(editor: Editor) {
  const previousUrl = editor.getAttributes("link").href;
  const url = window.prompt("URL", previousUrl);

  if (url === null) return true;

  if (url === "") {
    return editor.chain().focus().extendMarkRange("link").unsetLink().run();
  }

  return editor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({ href: url })
    .run();
}

export function applyEditorColor(editor: Editor, color: string | null) {
  const chain = editor.chain().focus();
  return color ? chain.setColor(color).run() : chain.unsetColor().run();
}

/**
 * Toggle headings without converting unrelated text around a partial selection.
 */
export function smartToggleHeading(editor: Editor, level: 1 | 2 | 3) {
  const { state } = editor;
  const { from, to, empty } = state.selection;

  if (editor.isActive("heading", { level })) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  if (empty) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  const blockStart = $from.start($from.depth);
  const blockEnd = $from.end($from.depth);

  if ($from.depth !== $to.depth || $from.parent !== $to.parent) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  const selectionCoversFullBlock = from <= blockStart && to >= blockEnd;
  if (selectionCoversFullBlock) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  const hasTextBefore = from > blockStart;
  const hasTextAfter = to < blockEnd;
  const { tr } = editor.state;

  if (hasTextAfter) tr.split(to);
  if (hasTextBefore) tr.split(from);

  editor.view.dispatch(tr);

  requestAnimationFrame(() => {
    const targetPos = hasTextBefore ? from + 1 : from;
    editor
      .chain()
      .focus()
      .setTextSelection(targetPos)
      .toggleHeading({ level })
      .run();
  });
}

function insertParagraphAfterHeading(editor: Editor) {
  const { state, view } = editor;
  const { selection, schema } = state;

  if (!selection.empty) return false;

  const { $from } = selection;
  const paragraph = schema.nodes.paragraph;
  const isHeading = $from.parent.type.name === "heading";
  const isAtEndOfHeading = $from.parentOffset === $from.parent.content.size;

  if (!paragraph || !isHeading || !isAtEndOfHeading) return false;

  const insertPos = $from.after($from.depth);
  const tr = state.tr.insert(insertPos, paragraph.create());
  const selectionPos = Math.min(insertPos + 1, tr.doc.content.size);

  view.dispatch(
    tr
      .setSelection(TextSelection.create(tr.doc, selectionPos))
      .scrollIntoView(),
  );
  return true;
}

export function createEditorShortcutsExtension(onSave?: () => void) {
  return Extension.create({
    name: "johnnyEditorShortcuts",

    addKeyboardShortcuts() {
      const { editor } = this;
      const shortcuts: ShortcutHandlers = {
        Enter: () => insertParagraphAfterHeading(editor),
      };

      addShortcut(shortcuts, "undo", () => editor.chain().focus().undo().run());
      addShortcut(shortcuts, "redo", () => editor.chain().focus().redo().run());
      addShortcut(shortcuts, "bold", () =>
        editor.chain().focus().toggleBold().run(),
      );
      addShortcut(shortcuts, "italic", () =>
        editor.chain().focus().toggleItalic().run(),
      );
      addShortcut(shortcuts, "underline", () =>
        editor.chain().focus().toggleUnderline().run(),
      );
      addShortcut(shortcuts, "strike", () =>
        editor.chain().focus().toggleStrike().run(),
      );
      addShortcut(shortcuts, "heading-1", () => {
        smartToggleHeading(editor, 1);
        return true;
      });
      addShortcut(shortcuts, "heading-2", () => {
        smartToggleHeading(editor, 2);
        return true;
      });
      addShortcut(shortcuts, "heading-3", () => {
        smartToggleHeading(editor, 3);
        return true;
      });
      addShortcut(shortcuts, "ordered-list", () =>
        editor.chain().focus().toggleOrderedList().run(),
      );
      addShortcut(shortcuts, "bullet-list", () =>
        editor.chain().focus().toggleBulletList().run(),
      );
      addShortcut(shortcuts, "blockquote", () =>
        editor.chain().focus().toggleBlockquote().run(),
      );
      addShortcut(shortcuts, "code-block", () =>
        editor.chain().focus().toggleCodeBlock().run(),
      );
      addShortcut(shortcuts, "link", () => setEditorLink(editor));
      addShortcut(shortcuts, "save", () => {
        onSave?.();
        return true;
      });

      return shortcuts;
    },
  });
}
