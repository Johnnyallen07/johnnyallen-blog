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
import { fetchClient } from "@/lib/api";
import { toast } from "sonner";
import { useEffect, useState } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const [isUploading, setIsUploading] = useState(false);

  const uploadImage = async (file: File): Promise<string | null> => {
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

      // 2. Upload to R2
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Upload to R2 failed");
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
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3], // Enable H1, H2, H3
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
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none min-h-[400px] p-6",
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            uploadImage(file).then((url) => {
              console.log("Inserted image URL:", url);
              if (url) {
                const { schema } = view.state;
                const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (coordinates && schema.nodes.image) {
                  const node = schema.nodes.image.create({ src: url });
                  const transaction = view.state.tr.insert(coordinates.pos, node);
                  view.dispatch(transaction);
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
                      const transaction = view.state.tr.replaceSelectionWith(node);
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
    },
  });

  // Sync content updates from parent (if changed externally)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Only set content if it's different to avoid cursor jumps
      // This simple check might not be enough for real-time collab but works for simple CMS
      if (editor.getText() === "" && content === "") return;

      // If the content is significantly different, or we are loading for the first time
      // Check if focused to avoid typing interruption
      if (!editor.isFocused) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

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
      <EditorContent editor={editor} />
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-between text-xs text-gray-500">
        <span>{editor.storage.characterCount?.words?.() || 0} 字</span>
        <span>Markdown 快捷键支持</span>
      </div>
    </div>
  );
}
