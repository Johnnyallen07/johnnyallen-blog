"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import UnderlineExtension from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { VideoExtension } from "@/lib/tiptap-video";
import { EditorToolbar } from "./EditorToolbar";
import { EditorContextMenu } from "./EditorContextMenu";
import { fetchClient } from "@/lib/api";
import { importMarkdownFile, exportAsZip } from "@/lib/importExport";
import { toast } from "sonner";
import { useEffect, useState, useCallback, useRef } from "react";

const MAX_VIDEO_SIZE_MB = 20;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 30;

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  articleTitle?: string;
}

/**
 * Validate video file size and duration before upload.
 * Returns null if valid, or an error message string.
 */
async function validateVideo(file: File): Promise<string | null> {
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return `视频文件太大（${(file.size / 1024 / 1024).toFixed(1)} MB），最大 ${MAX_VIDEO_SIZE_MB} MB`;
  }

  // Validate duration by loading into a <video> element
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      if (video.duration > MAX_VIDEO_DURATION_SECONDS) {
        resolve(
          `视频时长 ${Math.ceil(video.duration)} 秒，超过 ${MAX_VIDEO_DURATION_SECONDS} 秒限制`
        );
      } else {
        resolve(null);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve("无法读取视频文件，请确认格式正确（支持 mp4/webm）");
    };
    video.src = URL.createObjectURL(file);
  });
}

export function RichTextEditor({ content, onChange, onSave, articleTitle }: RichTextEditorProps) {
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

  const uploadVideo = useCallback(async (file: File): Promise<string | null> => {
    try {
      // Validate before uploading
      const validationError = await validateVideo(file);
      if (validationError) {
        toast.error(validationError);
        return null;
      }

      setIsUploading(true);
      const toastId = toast.loading("正在上传视频...");

      // 1. Get presigned URL
      const { uploadUrl, publicUrl } = await fetchClient("/media/upload-url", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          type: "video",
        }),
      });

      // 2. Upload to COS
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
      toast.success("视频上传成功");
      return publicUrl;
    } catch (error) {
      console.error(error);
      toast.error("视频上传失败");
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
      VideoExtension,
    ],
    content: content,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastInternalContent.current = html;
      onChange(html);
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

          // Handle image drop
          if (file.type.startsWith("image/")) {
            event.preventDefault();

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
                    const maxPos = view.state.doc.content.size;
                    const insertPos = dropPos
                      ? Math.min(dropPos.pos, maxPos)
                      : view.state.selection.anchor;
                    const tr = view.state.tr.insert(insertPos, node);
                    view.dispatch(tr);
                  } catch (e) {
                    console.warn("Drop position insert failed, using cursor position:", e);
                    try {
                      const tr = view.state.tr.insert(
                        view.state.selection.anchor,
                        node
                      );
                      view.dispatch(tr);
                    } catch (e2) {
                      console.warn("Cursor insert also failed, using editor API:", e2);
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

          // Handle video drop
          if (file.type.startsWith("video/")) {
            event.preventDefault();

            uploadVideo(file).then((url) => {
              if (url && editorRef.current) {
                editorRef.current.chain().focus().setVideo({ src: url }).run();
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

            // Handle image paste
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

            // Handle video paste
            if (item && item.type.indexOf("video") !== -1) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                uploadVideo(file).then((url) => {
                  if (url && editorRef.current) {
                    editorRef.current.chain().focus().setVideo({ src: url }).run();
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

  // Track content set internally by onUpdate to skip unnecessary getHTML() calls
  const lastInternalContent = useRef(content);

  // Sync content updates from parent (if changed externally)
  useEffect(() => {
    // If the content change came from our own onUpdate, skip the expensive check
    if (content === lastInternalContent.current) return;
    if (editor && !editor.isFocused) {
      if (editor.getText() === "" && content === "") return;
      editor.commands.setContent(content);
    }
    lastInternalContent.current = content;
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

  const handleVideoUploadButton = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/webm";
    input.onchange = async () => {
      if (input.files?.length && input.files[0]) {
        const url = await uploadVideo(input.files[0]);
        if (url && editor) {
          editor.chain().focus().setVideo({ src: url }).run();
        }
      }
    };
    input.click();
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.onchange = async () => {
      if (input.files?.length && input.files[0]) {
        try {
          const html = await importMarkdownFile(input.files[0]);
          if (editor) {
            editor.commands.setContent(html);
            onChange(html);
            toast.success("导入成功", {
              description: `已从 ${input.files[0].name} 导入内容`,
            });
          }
        } catch (error) {
          console.error(error);
          toast.error("导入失败");
        }
      }
    };
    input.click();
  };

  const handleExport = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === "<p></p>") {
      toast.error("没有可导出的内容");
      return;
    }
    try {
      const toastId = toast.loading("正在导出...");
      await exportAsZip(html, articleTitle || "article");
      toast.dismiss(toastId);
      toast.success("导出成功", {
        description: "ZIP 文件已下载",
      });
    } catch (error) {
      console.error(error);
      toast.error("导出失败");
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <EditorToolbar
        editor={editor}
        onImageUpload={handleImageUploadButton}
        onVideoUpload={handleVideoUploadButton}
        onImport={handleImport}
        onExport={handleExport}
      />
      {isUploading && <div className="h-1 bg-cyan-500 animate-pulse"></div>}
      <div onContextMenu={handleContextMenu}>
        <EditorContent editor={editor} />
      </div>
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-between text-xs text-gray-500">
        <span>{editor.storage.characterCount?.words?.() || 0} 字</span>
        <span>Ctrl+S 保存 · 右键快捷操作 · 支持拖拽上传图片/视频</span>
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
