import TurndownService from "turndown";
import JSZip from "jszip";

// ============================================================
// Import: .md → HTML (for Tiptap)
// ============================================================

/**
 * Read a .md file and convert it to basic HTML that Tiptap can consume.
 */
export async function importMarkdownFile(file: File): Promise<string> {
    const text = await file.text();
    return markdownToHtml(text);
}

/**
 * Simple Markdown → HTML converter.
 * Handles headings, bold, italic, strikethrough, images, links,
 * code blocks, inline code, blockquotes, ordered/unordered lists,
 * and horizontal rules.
 */
function markdownToHtml(md: string): string {
    let html = md;

    // Fenced code blocks (```lang ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
        const escaped = escapeHtml(code.trimEnd());
        return `<pre><code>${escaped}</code></pre>`;
    });

    // Blockquotes (lines starting with >)
    html = html.replace(/^(?:>\s?.+\n?)+/gm, (block) => {
        const inner = block
            .split("\n")
            .map((l) => l.replace(/^>\s?/, ""))
            .join("\n")
            .trim();
        return `<blockquote><p>${inner}</p></blockquote>\n`;
    });

    // Images ![alt](src)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

    // Video tags (preserve as-is if present in source)
    // Pattern: <video ...>...</video> — these are already HTML, skip conversion
    // We handle them by NOT wrapping them in <p> tags below

    // Links [text](href)
    html = html.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2">$1</a>'
    );

    // Headings
    html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
    html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    // Horizontal rule
    html = html.replace(/^(?:---|\*\*\*|___)\s*$/gm, "<hr />");

    // Bold + Italic combined (***text*** or ___text___)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/_(.+?)_/g, "<em>$1</em>");

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Unordered lists (lines starting with - or *)
    html = html.replace(/^(?:[*-]\s+.+\n?)+/gm, (block) => {
        const items = block
            .trim()
            .split("\n")
            .map((l) => `<li>${l.replace(/^[*-]\s+/, "")}</li>`)
            .join("");
        return `<ul>${items}</ul>\n`;
    });

    // Ordered lists (lines starting with 1. 2. etc.)
    html = html.replace(/^(?:\d+\.\s+.+\n?)+/gm, (block) => {
        const items = block
            .trim()
            .split("\n")
            .map((l) => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`)
            .join("");
        return `<ol>${items}</ol>\n`;
    });

    // Paragraphs: wrap remaining plain text lines
    const lines = html.split("\n");
    const result: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            result.push("");
            continue;
        }
        // Skip lines that are already wrapped in block-level tags
        if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|img|p|div|video|source)[\s>/]/i.test(trimmed)) {
            result.push(line);
        } else {
            result.push(`<p>${trimmed}</p>`);
        }
    }

    return result.filter((l) => l.trim() !== "").join("\n");
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ============================================================
// Export: HTML → Markdown ZIP (with assets)
// ============================================================

/**
 * Export editor HTML content as a .zip containing:
 *   - article.md   (Markdown text with local image paths)
 *   - assets/       (downloaded images)
 */
export async function exportAsZip(
    htmlContent: string,
    title: string
): Promise<void> {
    // 1. Convert HTML → Markdown
    const turndown = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
    });
    // Add video turndown rule
    turndown.addRule("video", {
        filter: "video",
        replacement: (_content: string, node: unknown) => {
            const el = node as HTMLElement;
            const source = el.querySelector("source");
            const src = source?.getAttribute("src") || el.getAttribute("src") || "";
            return `\n\n<video controls preload="metadata" playsinline style="max-width: 100%; border-radius: 8px;"><source src="${src}" /></video>\n\n`;
        },
    });

    let markdown = turndown.turndown(htmlContent);

    // 2. Extract image URLs from markdown
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images: { fullMatch: string; alt: string; url: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(markdown)) !== null) {
        images.push({
            fullMatch: match[0],
            alt: match[1] ?? "",
            url: match[2] ?? "",
        });
    }

    // 3. Download images and build ZIP
    const zip = new JSZip();
    const assetsFolder = zip.folder("assets")!;
    let imageIndex = 0;

    for (const img of images) {
        try {
            const response = await fetch(img.url);
            if (!response.ok) continue;

            const blob = await response.blob();
            // Derive extension from URL or content-type
            const ext = getMediaExtension(img.url, response.headers.get("content-type"));
            const fileName = `image-${++imageIndex}${ext}`;

            assetsFolder.file(fileName, blob);
            // Replace URL in markdown with local path
            markdown = markdown.replace(img.url, `./assets/${fileName}`);
        } catch (e) {
            console.warn(`Failed to download image: ${img.url}`, e);
            // Keep original URL if download fails
        }
    }

    // 4. Extract and download video URLs from <video>/<source> tags
    const videoRegex = /<source\s+src="([^"]+)"/g;
    const videos: { url: string }[] = [];
    let videoMatch: RegExpExecArray | null;
    while ((videoMatch = videoRegex.exec(markdown)) !== null) {
        videos.push({ url: videoMatch[1] ?? "" });
    }

    let videoIndex = 0;
    for (const vid of videos) {
        try {
            const response = await fetch(vid.url);
            if (!response.ok) continue;

            const blob = await response.blob();
            const ext = getMediaExtension(vid.url, response.headers.get("content-type"));
            const fileName = `video-${++videoIndex}${ext}`;

            assetsFolder.file(fileName, blob);
            markdown = markdown.replace(vid.url, `./assets/${fileName}`);
        } catch (e) {
            console.warn(`Failed to download video: ${vid.url}`, e);
        }
    }

    // 4. Write markdown file
    zip.file("article.md", markdown);

    // 5. Generate and download ZIP
    const blob = await zip.generateAsync({ type: "blob" });
    const safeName = title
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
        .substring(0, 50) || "article";
    downloadBlob(blob, `${safeName}.zip`);
}

function getMediaExtension(url: string, contentType: string | null): string {
    // Try to get from URL
    const urlMatch = url.match(/\.(\w{3,4})(?:[?#]|$)/);
    if (urlMatch && urlMatch[1]) {
        const ext = urlMatch[1].toLowerCase();
        if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp", "mp4", "webm"].includes(ext)) {
            return `.${ext}`;
        }
    }

    // Fallback to content-type
    if (contentType) {
        const typeMap: Record<string, string> = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
            "image/avif": ".avif",
            "image/bmp": ".bmp",
            "video/mp4": ".mp4",
            "video/webm": ".webm",
        };
        return typeMap[contentType] || ".bin";
    }

    return ".bin";
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
