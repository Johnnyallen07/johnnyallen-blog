import { Node, mergeAttributes } from "@tiptap/core";

export interface VideoOptions {
    HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        video: {
            setVideo: (options: { src: string }) => ReturnType;
        };
    }
}

/**
 * Custom Tiptap node extension for inline video playback.
 * Renders as an HTML5 <video> element with controls.
 */
export const VideoExtension = Node.create<VideoOptions>({
    name: "video",

    group: "block",

    atom: true,

    addOptions() {
        return {
            HTMLAttributes: {},
        };
    },

    addAttributes() {
        return {
            src: {
                default: null,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: "video",
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            "video",
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                controls: "true",
                preload: "metadata",
                playsinline: "true",
                style: "max-width: 100%; border-radius: 8px; margin: 8px 0;",
            }),
            // <source> tag for the video
            [
                "source",
                {
                    src: HTMLAttributes.src,
                    type: HTMLAttributes.src?.endsWith(".webm")
                        ? "video/webm"
                        : "video/mp4",
                },
            ],
        ];
    },

    addCommands() {
        return {
            setVideo:
                (options) =>
                    ({ commands }) => {
                        return commands.insertContent({
                            type: this.name,
                            attrs: options,
                        });
                    },
        };
    },
});
