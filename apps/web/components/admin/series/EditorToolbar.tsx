"use client";

import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Link,
  Image,
  Video,
  Code,
  Quote,
  Undo,
  Redo,
  Strikethrough,
  Upload,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { type Editor } from "@tiptap/react";

interface EditorToolbarProps {
  editor: Editor | null;
  onImageUpload: () => void;
  onVideoUpload: () => void;
  onImport: () => void;
  onExport: () => void;
}

/**
 * Smart heading toggle that handles partial text selection.
 *
 * Standard Tiptap toggleHeading converts the entire block (paragraph) to a heading.
 * This function detects when the user has selected only part of a paragraph and:
 *   1. Splits the block at the selection boundaries to isolate the selected text
 *   2. Applies the heading to the newly isolated block
 *
 * If the selection covers the full block or the cursor is collapsed, it falls back
 * to the standard toggleHeading behavior.
 */
function smartToggleHeading(editor: Editor, level: 1 | 2 | 3) {
  const { state } = editor;
  const { from, to, empty } = state.selection;

  // If already a heading at this level, just toggle it off (back to paragraph)
  if (editor.isActive("heading", { level })) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  // If cursor is collapsed (no selection), apply heading to the whole block — standard behavior
  if (empty) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  // Determine the block that contains the selection start
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  const blockStart = $from.start($from.depth);
  const blockEnd = $from.end($from.depth);

  // If selection spans multiple blocks, or covers the full block, use standard behavior
  if ($from.depth !== $to.depth || $from.parent !== $to.parent) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  const selectionCoversFullBlock = from <= blockStart && to >= blockEnd;
  if (selectionCoversFullBlock) {
    editor.chain().focus().toggleHeading({ level }).run();
    return;
  }

  // Partial selection within a single block — split and isolate
  const hasTextBefore = from > blockStart;
  const hasTextAfter = to < blockEnd;

  // Build a transaction with the necessary splits
  const { tr } = editor.state;

  if (hasTextAfter) {
    // Split at the end of the selection first (preserves earlier positions)
    tr.split(to);
  }
  if (hasTextBefore) {
    // Split at the beginning of the selection
    tr.split(from);
  }

  editor.view.dispatch(tr);

  // After splitting, the selected text is now in its own block.
  // Use requestAnimationFrame to let the DOM update, then apply heading.
  requestAnimationFrame(() => {
    // Position the cursor inside the isolated block
    const targetPos = hasTextBefore ? from + 1 : from;
    editor
      .chain()
      .focus()
      .setTextSelection(targetPos)
      .toggleHeading({ level })
      .run();
  });
}

interface ToolbarButton {
  icon: LucideIcon;
  command: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
  label: string;
}

const toolbarButtons: ToolbarButton[] = [
  {
    icon: Undo,
    command: (editor) => editor.chain().focus().undo().run(),
    label: "撤销",
  },
  {
    icon: Redo,
    command: (editor) => editor.chain().focus().redo().run(),
    label: "重做",
  },
  {
    icon: Bold,
    command: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive("bold"),
    label: "粗体",
  },
  {
    icon: Italic,
    command: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive("italic"),
    label: "斜体",
  },
  {
    icon: Underline,
    command: (editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor) => editor.isActive("underline"),
    label: "下划线",
  },
  {
    icon: Strikethrough,
    command: (editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor) => editor.isActive("strike"),
    label: "删除线",
  },
  {
    icon: Heading1,
    command: (editor) => smartToggleHeading(editor, 1),
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
    label: "一级标题",
  },
  {
    icon: Heading2,
    command: (editor) => smartToggleHeading(editor, 2),
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    label: "二级标题",
  },
  {
    icon: Heading3,
    command: (editor) => smartToggleHeading(editor, 3),
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    label: "三级标题",
  },
  {
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive("bulletList"),
    label: "无序列表",
  },
  {
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive("orderedList"),
    label: "有序列表",
  },
  {
    icon: Quote,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    isActive: (editor) => editor.isActive("blockquote"),
    label: "引用",
  },
  {
    icon: Code,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive("codeBlock"),
    label: "代码块",
  },
];

export function EditorToolbar({ editor, onImageUpload, onVideoUpload, onImport, onExport }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex items-center gap-1 p-2 border-b border-gray-200 flex-wrap bg-gray-50 sticky top-0 z-10">
      {toolbarButtons.map((button, index) => {
        const IconComponent = button.icon;
        const isActive = button.isActive ? button.isActive(editor) : false;

        return (
          <Button
            key={index}
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            onClick={() => button.command(editor)}
            className={`h-8 w-8 p-0 ${isActive ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-200"}`}
            title={button.label}
          >
            <IconComponent className="h-4 w-4" />
          </Button>
        );
      })}

      <Button
        variant={editor.isActive("link") ? "secondary" : "ghost"}
        size="sm"
        onClick={setLink}
        className={`h-8 w-8 p-0 ${editor.isActive("link") ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-200"}`}
        title="链接"
      >
        <Link className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onImageUpload}
        className="h-8 w-8 p-0 hover:bg-purple-100 hover:text-purple-600 text-gray-600"
        title="插入图片"
      >
        <Image className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onVideoUpload}
        className="h-8 w-8 p-0 hover:bg-purple-100 hover:text-purple-600 text-gray-600"
        title="插入视频 (≤30s, ≤20MB)"
      >
        <Video className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onImport}
        className="h-8 w-8 p-0 hover:bg-green-100 hover:text-green-600 text-gray-600"
        title="导入 Markdown"
      >
        <Upload className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onExport}
        className="h-8 w-8 p-0 hover:bg-blue-100 hover:text-blue-600 text-gray-600"
        title="导出为 ZIP"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
