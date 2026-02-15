"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import UnderlineExtension from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { EditorToolbar } from "./EditorToolbar";
import { EditorContextMenu } from "./EditorContextMenu";
import { fetchClient } from "@/lib/api";
import { toast } from "sonner";
import { useEffect, useState, useCallback, useRef } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
}

export function RichTextEditor({ content, onChange, onSave }: RichTextEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
    try {
      setIsUploading(true);
      const toastId = toast.loading("正在上传图片...");

      // 1. Get presigned URL
      const { uploadUrl, publicUrl } = await fetchClient("/media/upload-url", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          type: "image",
        }),
      });

      // 2. 上传到存储桶（腾讯云 COS）
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("上传到存储失败");
      }

      toast.dismiss(toastId);
      toast.success("图片上传成功");
      return publicUrl;
    } catch (error) {
      console.error(error);
      toast.error("图片上传失败");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Placeholder.configure({
        placeholder: "开始写作...",
      }),
      ImageExtension,
      UnderlineExtension,
      LinkExtension.configure({
        openOnClick: false,
      }),
      TextStyle,
      Color,
    ],
    content: content,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none min-h-[400px] p-6",
      },
      handleDrop: (view, event, _slice, moved) => {
        if (
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files[0]
        ) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            event.preventDefault();

            // Capture drop position SYNCHRONOUSLY before the async upload
            // This avoids stale coordinates after layout changes
            const dropPos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });

            uploadImage(file).then((url) => {
              if (url) {
                const { schema } = view.state;
                if (schema.nodes.image) {
                  const node = schema.nodes.image.create({ src: url });
                  try {
                    // Clamp position to valid range (document may have changed during upload)
                    const maxPos = view.state.doc.content.size;
                    const insertPos = dropPos
                      ? Math.min(dropPos.pos, maxPos)
                      : view.state.selection.anchor;
                    const tr = view.state.tr.insert(insertPos, node);
                    view.dispatch(tr);
                  } catch (e) {
                    console.warn("Drop position insert failed, using cursor position:", e);
                    // Fallback: insert at current cursor position
                    try {
                      const tr = view.state.tr.insert(
                        view.state.selection.anchor,
                        node
                      );
                      view.dispatch(tr);
                    } catch (e2) {
                      console.warn("Cursor insert also failed, using editor API:", e2);
                      // Last resort: use the editor ref
                      editorRef.current
                        ?.chain()
                        .focus()
                        .setImage({ src: url })
                        .run();
                    }
                  }
                }
              }
            });
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (item && item.type.indexOf("image") !== -1) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                uploadImage(file).then((url) => {
                  if (url) {
                    const { schema } = view.state;
                    if (schema.nodes.image) {
                      const node = schema.nodes.image.create({ src: url });
                      const transaction =
                        view.state.tr.replaceSelectionWith(node);
                      view.dispatch(transaction);
                    }
                  }
                });
              }
              return true;
            }
          }
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        // Ctrl+S / Cmd+S to save
        if ((event.ctrlKey || event.metaKey) && event.key === "s") {
          event.preventDefault();
          onSave?.();
          return true;
        }
        return false;
      },
    },
  });

  // Keep editorRef in sync so fallback code can use it
  useEffect(() => {
    (editorRef as React.MutableRefObject<typeof editor>).current = editor;
  }, [editor]);

  // Sync content updates from parent (if changed externally)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      if (editor.getText() === "" && content === "") return;
      if (!editor.isFocused) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only show context menu if right-clicking inside the editor content area
      const target = e.target as HTMLElement;
      if (target.closest(".ProseMirror")) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    []
  );

  const handleImageUploadButton = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      if (input.files?.length && input.files[0]) {
        const url = await uploadImage(input.files[0]);
        if (url && editor) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      }
    };
    input.click();
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <EditorToolbar editor={editor} onImageUpload={handleImageUploadButton} />
      {isUploading && <div className="h-1 bg-cyan-500 animate-pulse"></div>}
      <div onContextMenu={handleContextMenu}>
        <EditorContent editor={editor} />
      </div>
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-between text-xs text-gray-500">
        <span>{editor.storage.characterCount?.words?.() || 0} 字</span>
        <span>Ctrl+S 保存 · 右键快捷操作 · Markdown 快捷键支持</span>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <EditorContextMenu
          editor={editor}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onImageUpload={handleImageUploadButton}
        />
      )}
    </div>
  );
}
