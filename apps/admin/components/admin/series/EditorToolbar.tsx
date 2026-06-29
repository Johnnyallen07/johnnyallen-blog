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
  FileUp,
  Code,
  Quote,
  Undo,
  Redo,
  Strikethrough,
  Upload,
  Download,
  Palette,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { type Editor } from "@tiptap/react";
import {
  EDITOR_COLOR_SWATCHES,
  getEditorShortcutLabel,
} from "@/lib/editor-shortcuts";
import {
  applyEditorColor,
  setEditorLink,
  smartToggleHeading,
} from "@/lib/editor-commands";

interface EditorToolbarProps {
  editor: Editor | null;
  onImageUpload: () => void;
  onVideoUpload: () => void;
  onAttachmentUpload: () => void;
  onImport: () => void;
  onExport: () => void;
}

interface ToolbarButton {
  icon: LucideIcon;
  command: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
  label: string;
  shortcutId?: string;
}

const toolbarButtons: ToolbarButton[] = [
  {
    icon: Undo,
    command: (editor) => editor.chain().focus().undo().run(),
    label: "撤销",
    shortcutId: "undo",
  },
  {
    icon: Redo,
    command: (editor) => editor.chain().focus().redo().run(),
    label: "重做",
    shortcutId: "redo",
  },
  {
    icon: Bold,
    command: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive("bold"),
    label: "粗体",
    shortcutId: "bold",
  },
  {
    icon: Italic,
    command: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive("italic"),
    label: "斜体",
    shortcutId: "italic",
  },
  {
    icon: Underline,
    command: (editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor) => editor.isActive("underline"),
    label: "下划线",
    shortcutId: "underline",
  },
  {
    icon: Strikethrough,
    command: (editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor) => editor.isActive("strike"),
    label: "删除线",
    shortcutId: "strike",
  },
  {
    icon: Heading1,
    command: (editor) => smartToggleHeading(editor, 1),
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
    label: "一级标题",
    shortcutId: "heading-1",
  },
  {
    icon: Heading2,
    command: (editor) => smartToggleHeading(editor, 2),
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    label: "二级标题",
    shortcutId: "heading-2",
  },
  {
    icon: Heading3,
    command: (editor) => smartToggleHeading(editor, 3),
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    label: "三级标题",
    shortcutId: "heading-3",
  },
  {
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive("bulletList"),
    label: "无序列表",
    shortcutId: "bullet-list",
  },
  {
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive("orderedList"),
    label: "有序列表",
    shortcutId: "ordered-list",
  },
  {
    icon: Quote,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    isActive: (editor) => editor.isActive("blockquote"),
    label: "引用",
    shortcutId: "blockquote",
  },
  {
    icon: Code,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive("codeBlock"),
    label: "代码块",
    shortcutId: "code-block",
  },
];

export function EditorToolbar({
  editor,
  onImageUpload,
  onVideoUpload,
  onAttachmentUpload,
  onImport,
  onExport,
}: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  const platform =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
      ? "mac"
      : "windows";
  const currentColor = editor.getAttributes("textStyle").color || "#374151";
  const labelWithShortcut = (label: string, shortcutId?: string) => {
    const shortcut = shortcutId
      ? getEditorShortcutLabel(shortcutId, platform)
      : "";
    return shortcut ? `${label} (${shortcut})` : label;
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
            title={labelWithShortcut(button.label, button.shortcutId)}
          >
            <IconComponent className="h-4 w-4" />
          </Button>
        );
      })}

      <Button
        variant={editor.isActive("link") ? "secondary" : "ghost"}
        size="sm"
        onClick={() => setEditorLink(editor)}
        className={`h-8 w-8 p-0 ${editor.isActive("link") ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-200"}`}
        title={labelWithShortcut("链接", "link")}
      >
        <Link className="h-4 w-4" />
      </Button>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      <div className="flex items-center gap-1" aria-label="字体颜色">
        <label
          className="relative h-8 w-8 rounded-md inline-flex items-center justify-center text-gray-600 hover:bg-gray-200 cursor-pointer"
          title="自定义字体颜色"
        >
          <Palette className="h-4 w-4" />
          <span
            className="absolute bottom-1 left-2 right-2 h-0.5 rounded-full"
            style={{ backgroundColor: currentColor }}
          />
          <input
            type="color"
            value={currentColor}
            onChange={(event) => applyEditorColor(editor, event.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="自定义字体颜色"
          />
        </label>
        {EDITOR_COLOR_SWATCHES.map((swatch) => {
          const isActive =
            swatch.value === null
              ? !editor.getAttributes("textStyle").color
              : currentColor.toLowerCase() === swatch.value.toLowerCase();
          return (
            <button
              key={swatch.label}
              type="button"
              onClick={() => applyEditorColor(editor, swatch.value)}
              title={swatch.label}
              className={`h-6 w-6 rounded-md border flex items-center justify-center ${
                isActive ? "border-gray-900" : "border-gray-300"
              }`}
              style={{
                backgroundColor: swatch.value || "#ffffff",
              }}
            >
              {swatch.value === null && (
                <Eraser className="h-3.5 w-3.5 text-gray-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="w-px h-6 bg-gray-300 mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={onImageUpload}
        className="h-8 w-8 p-0 hover:bg-amber-100 hover:text-amber-600 text-gray-600"
        title="插入图片"
      >
        <Image className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onVideoUpload}
        className="h-8 w-8 p-0 hover:bg-amber-100 hover:text-amber-600 text-gray-600"
        title="插入视频 (≤30s, ≤20MB)"
      >
        <Video className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onAttachmentUpload}
        className="h-8 w-8 p-0 hover:bg-amber-100 hover:text-amber-600 text-gray-600"
        title="插入可下载附件"
      >
        <FileUp className="h-4 w-4" />
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
