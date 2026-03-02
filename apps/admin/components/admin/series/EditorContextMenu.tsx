"use client";

import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Minus,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";

interface EditorContextMenuProps {
  editor: Editor;
  position: { x: number; y: number };
  onClose: () => void;
  onImageUpload: () => void;
}

interface MenuItem {
  type: "action" | "separator";
  icon?: LucideIcon;
  label?: string;
  shortcut?: string;
  action?: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

const menuItems: MenuItem[] = [
  {
    type: "action",
    icon: Bold,
    label: "加粗",
    shortcut: "Ctrl+B",
    action: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive("bold"),
  },
  {
    type: "action",
    icon: Italic,
    label: "斜体",
    shortcut: "Ctrl+I",
    action: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive("italic"),
  },
  {
    type: "action",
    icon: Underline,
    label: "下划线",
    shortcut: "Ctrl+U",
    action: (editor) => editor.chain().focus().toggleUnderline().run(),
    isActive: (editor) => editor.isActive("underline"),
  },
  {
    type: "action",
    icon: Strikethrough,
    label: "删除线",
    action: (editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor) => editor.isActive("strike"),
  },
  { type: "separator" },
  {
    type: "action",
    icon: Heading1,
    label: "一级标题",
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
  },
  {
    type: "action",
    icon: Heading2,
    label: "二级标题",
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
  },
  {
    type: "action",
    icon: Heading3,
    label: "三级标题",
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
  },
  { type: "separator" },
  {
    type: "action",
    icon: List,
    label: "无序列表",
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive("bulletList"),
  },
  {
    type: "action",
    icon: ListOrdered,
    label: "有序列表",
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive("orderedList"),
  },
  {
    type: "action",
    icon: Quote,
    label: "引用",
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    isActive: (editor) => editor.isActive("blockquote"),
  },
  {
    type: "action",
    icon: Code,
    label: "代码块",
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive("codeBlock"),
  },
  {
    type: "action",
    icon: Minus,
    label: "分割线",
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  { type: "separator" },
  {
    type: "action",
    icon: Link,
    label: "插入链接",
    shortcut: "Ctrl+K",
    // handled separately
    isActive: (editor) => editor.isActive("link"),
  },
  {
    type: "action",
    icon: Image,
    label: "上传图片",
    // handled separately
  },
];

export function EditorContextMenu({
  editor,
  position,
  onClose,
  onImageUpload,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Use a timeout so the same right-click event doesn't immediately close the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (rect.right > vw) {
        menuRef.current.style.left = `${position.x - rect.width}px`;
      }
      if (rect.bottom > vh) {
        menuRef.current.style.top = `${position.y - rect.height}px`;
      }
    }
  }, [position]);

  const handleAction = (item: MenuItem) => {
    if (item.label === "插入链接") {
      const previousUrl = editor.getAttributes("link").href;
      const url = window.prompt("输入链接地址", previousUrl);
      if (url === null) {
        onClose();
        return;
      }
      if (url === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: url })
          .run();
      }
      onClose();
      return;
    }

    if (item.label === "上传图片") {
      onClose();
      onImageUpload();
      return;
    }

    if (item.action) {
      item.action(editor);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      {menuItems.map((item, index) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${index}`}
              className="h-px bg-gray-200 my-1 mx-2"
            />
          );
        }

        const IconComponent = item.icon!;
        const isActive = item.isActive ? item.isActive(editor) : false;

        return (
          <button
            key={item.label}
            onClick={() => handleAction(item)}
            className={`w-full flex items-center gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-gray-100 ${
              isActive ? "text-cyan-600 bg-cyan-50" : "text-gray-700"
            }`}
          >
            <IconComponent className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-gray-400 ml-4">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
