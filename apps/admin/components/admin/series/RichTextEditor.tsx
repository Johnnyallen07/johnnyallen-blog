"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
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
import { fetchClient, getApiBaseUrl } from "@/lib/api";
import { importMarkdownFile, exportAsZip } from "@/lib/importExport";
import { createEditorShortcutsExtension } from "@/lib/editor-commands";
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

interface UploadedAttachment {
  key: string;
  publicUrl: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

interface UploadImageOptions {
  quiet?: boolean;
}

interface PastedHtmlImageResult {
  html: string;
  imageCount: number;
  uploadedCount: number;
  failedCount: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function hasPastedHtmlImages(html?: string | null): boolean {
  return Boolean(html && /<img\b[^>]*\bsrc=["'][^"']+["'][^>]*>/i.test(html));
}

function extensionFromMime(contentType: string | undefined): string {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/gif") return "gif";
  if (type === "image/webp") return "webp";
  if (type === "image/svg+xml") return "svg";
  return "png";
}

function filenameFromImageSource(
  src: string,
  contentType: string,
  index: number,
) {
  try {
    const parsed = new URL(src, window.location.href);
    const rawName = parsed.pathname.split("/").filter(Boolean).pop();
    if (rawName && /\.[a-z0-9]+$/i.test(rawName)) {
      return decodeURIComponent(rawName);
    }
  } catch {
    // Fall back to a generated name below.
  }
  return `pasted-image-${index + 1}.${extensionFromMime(contentType)}`;
}

function resolvePastedImageSource(src: string): string {
  if (/^data:/i.test(src)) return src;
  if (/^\/?assets\//i.test(src)) {
    const key = src.replace(/^\/+/, "");
    return `${getApiBaseUrl()}/media/${key}`;
  }
  if (/^\/media\//i.test(src)) {
    return `${getApiBaseUrl()}${src}`;
  }
  if (/^\/\//.test(src)) {
    return `${window.location.protocol}${src}`;
  }
  return new URL(src, window.location.href).toString();
}

function fileFromDataUrl(src: string, index: number): File {
  const [metadata = "", data = ""] = src.split(",");
  const contentType = metadata.match(/^data:([^;,]+)/i)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File(
    [bytes],
    `pasted-image-${index + 1}.${extensionFromMime(contentType)}`,
    { type: contentType },
  );
}

async function fileFromImageSource(src: string, index: number): Promise<File> {
  if (/^data:/i.test(src)) {
    return fileFromDataUrl(src, index);
  }

  const resolvedSrc = resolvePastedImageSource(src);
  const response = await fetch(resolvedSrc, {
    cache: "reload",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unsupported image content type: ${contentType}`);
  }

  const blob = await response.blob();
  return new File([blob], filenameFromImageSource(src, contentType, index), {
    type: contentType,
  });
}

async function uploadImagesFromPastedHtml(
  html: string,
  uploadImage: (
    file: File,
    options?: UploadImageOptions,
  ) => Promise<string | null>,
): Promise<PastedHtmlImageResult | null> {
  if (!hasPastedHtmlImages(html)) return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(doc.body.querySelectorAll("img[src]"));
  if (images.length === 0) return null;

  let uploadedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const src = image?.getAttribute("src");
    if (!image || !src) continue;

    try {
      const file = await fileFromImageSource(src, i);
      const url = await uploadImage(file, { quiet: true });
      if (!url) throw new Error("Image upload returned an empty URL");
      image.setAttribute("src", url);
      uploadedCount += 1;
    } catch (error) {
      console.warn("Failed to re-upload pasted image:", error);
      image.remove();
      failedCount += 1;
    }
  }

  return {
    html: doc.body.innerHTML,
    imageCount: images.length,
    uploadedCount,
    failedCount,
  };
}

function getAttachmentIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "ZIP";
  if (["jar", "mod"].includes(ext)) return "JAR";
  if (["pdf"].includes(ext)) return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "IMG";
  return "FILE";
}

const AttachmentExtension = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      href: { default: null },
      key: { default: null },
      fileName: { default: "attachment" },
      fileSize: { default: 0 },
      icon: { default: "FILE" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-attachment="true"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const href = el.getAttribute("href");
          const fileName =
            el.getAttribute("data-filename") || el.textContent || "attachment";
          return {
            href,
            key: el.getAttribute("data-key"),
            fileName,
            fileSize: Number(el.getAttribute("data-size") || 0),
            icon: getAttachmentIcon(fileName),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const fileName = HTMLAttributes.fileName || "attachment";
    const fileSize = Number(HTMLAttributes.fileSize || 0);
    const icon = HTMLAttributes.icon || getAttachmentIcon(fileName);
    return [
      "a",
      mergeAttributes({
        href: HTMLAttributes.href,
        "data-attachment": "true",
        "data-key": HTMLAttributes.key,
        "data-filename": fileName,
        "data-size": String(fileSize),
        download: fileName,
        class: "attachment-card",
        title: `点击下载 ${fileName}`,
      }),
      ["span", { class: "attachment-icon" }, icon],
      [
        "span",
        { class: "attachment-meta" },
        ["span", { class: "attachment-title" }, fileName],
        [
          "span",
          { class: "attachment-subtitle" },
          `点击下载 · ${formatBytes(fileSize)}`,
        ],
      ],
      ["span", { class: "attachment-action" }, "下载"],
    ];
  },
});

function buildAttachmentNode(file: UploadedAttachment) {
  return {
    type: "attachment",
    attrs: {
      href: file.publicUrl,
      key: file.key,
      fileName: file.fileName,
      fileSize: file.fileSize,
      icon: getAttachmentIcon(file.fileName),
    },
  };
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
          `视频时长 ${Math.ceil(video.duration)} 秒，超过 ${MAX_VIDEO_DURATION_SECONDS} 秒限制`,
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

export function RichTextEditor({
  content,
  onChange,
  onSave,
  articleTitle,
}: RichTextEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const uploadImage = useCallback(
    async (
      file: File,
      options?: UploadImageOptions,
    ): Promise<string | null> => {
      try {
        setIsUploading(true);
        const toastId = options?.quiet
          ? null
          : toast.loading("正在上传图片...");

        // 1. Get presigned URL
        const { uploadUrl, publicUrl } = await fetchClient(
          "/media/upload-url",
          {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
              type: "image",
            }),
          },
        );

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

        if (toastId !== null) {
          toast.dismiss(toastId);
          toast.success("图片上传成功");
        }
        return publicUrl;
      } catch (error) {
        console.error(error);
        if (!options?.quiet) toast.error("图片上传失败");
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const uploadVideo = useCallback(
    async (file: File): Promise<string | null> => {
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
        const { uploadUrl, publicUrl } = await fetchClient(
          "/media/upload-url",
          {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
              type: "video",
            }),
          },
        );

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
    },
    [],
  );

  const uploadAttachment = useCallback(
    async (file: File): Promise<UploadedAttachment | null> => {
      try {
        setIsUploading(true);
        const toastId = toast.loading("正在上传附件...");

        const { uploadUrl, key, publicUrl } = await fetchClient(
          "/media/upload-url",
          {
            method: "POST",
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
              type: "file",
            }),
          },
        );

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });

        if (!uploadRes.ok) {
          throw new Error("上传到存储失败");
        }

        toast.dismiss(toastId);
        toast.success("附件上传成功");
        return {
          key,
          publicUrl,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || "application/octet-stream",
        };
      } catch (error) {
        console.error(error);
        toast.error("附件上传失败");
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

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
      createEditorShortcutsExtension(onSave),
      VideoExtension,
      AttachmentExtension,
    ],
    content: content,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastInternalContent.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-gray max-w-none focus:outline-none min-h-[400px] p-6",
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
                    console.warn(
                      "Drop position insert failed, using cursor position:",
                      e,
                    );
                    try {
                      const tr = view.state.tr.insert(
                        view.state.selection.anchor,
                        node,
                      );
                      view.dispatch(tr);
                    } catch (e2) {
                      console.warn(
                        "Cursor insert also failed, using editor API:",
                        e2,
                      );
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

          // Handle generic file drop
          event.preventDefault();
          uploadAttachment(file).then((attachment) => {
            if (attachment && editorRef.current) {
              editorRef.current
                .chain()
                .focus()
                .insertContent(buildAttachmentNode(attachment))
                .run();
            }
          });
          return true;
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
                    editorRef.current
                      .chain()
                      .focus()
                      .setVideo({ src: url })
                      .run();
                  }
                });
              }
              return true;
            }

            if (item && item.kind === "file") {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) {
                uploadAttachment(file).then((attachment) => {
                  if (attachment && editorRef.current) {
                    editorRef.current
                      .chain()
                      .focus()
                      .insertContent(buildAttachmentNode(attachment))
                      .run();
                  }
                });
              }
              return true;
            }
          }
        }

        const html = event.clipboardData?.getData("text/html");
        if (hasPastedHtmlImages(html)) {
          event.preventDefault();
          const toastId = toast.loading("正在处理粘贴的图片...");

          uploadImagesFromPastedHtml(html || "", uploadImage)
            .then((result) => {
              toast.dismiss(toastId);
              if (!result) return;

              editorRef.current
                ?.chain()
                .focus()
                .insertContent(result.html)
                .run();

              if (result.failedCount > 0) {
                toast.error(
                  `已重新上传 ${result.uploadedCount} 张图片，${result.failedCount} 张源图不可访问，已跳过。`,
                );
                return;
              }

              toast.success(`已重新上传 ${result.uploadedCount} 张粘贴图片`);
            })
            .catch((error) => {
              console.error(error);
              toast.dismiss(toastId);
              toast.error("粘贴图片处理失败，请重新上传图片");
            });
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
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only show context menu if right-clicking inside the editor content area
    const target = e.target as HTMLElement;
    if (target.closest(".ProseMirror")) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, []);

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

  const handleAttachmentUploadButton = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      if (input.files?.length && input.files[0]) {
        const attachment = await uploadAttachment(input.files[0]);
        if (attachment && editor) {
          editor
            .chain()
            .focus()
            .insertContent(buildAttachmentNode(attachment))
            .run();
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
        onAttachmentUpload={handleAttachmentUploadButton}
        onImport={handleImport}
        onExport={handleExport}
      />
      {isUploading && <div className="h-1 bg-cyan-500 animate-pulse"></div>}
      <div onContextMenu={handleContextMenu}>
        <EditorContent editor={editor} />
      </div>
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex justify-between text-xs text-gray-500">
        <span>{editor.storage.characterCount?.words?.() || 0} 字</span>
        <span>Ctrl+S 保存 · 右键快捷操作 · 支持拖拽上传图片/视频/附件</span>
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
