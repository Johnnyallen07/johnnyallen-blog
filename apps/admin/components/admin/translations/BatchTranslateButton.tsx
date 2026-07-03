"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { fetchClient } from "@/lib/api";
import type { ContentRow, UiMessageRow } from "./types";

const TARGET_LOCALE = "en";
const UI_CHUNK_SIZE = 25;

interface BatchProps {
    /** ui = 界面文案批量；content = 某实体类型的内容批量 */
    kind: "ui" | "content";
    /** kind=content 时必传 */
    entityType?: string;
    onDone: () => void;
}

/**
 * “AI 翻译全部未翻译”：确认弹窗 → 拉取未翻译列表 → 分片顺序请求 →
 * 进度显示，可取消，单片失败不中断。
 */
export function BatchTranslateButton({ kind, entityType, onDone }: BatchProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
    const cancelRef = useRef(false);

    const run = async () => {
        setConfirmOpen(false);
        setIsRunning(true);
        cancelRef.current = false;
        let failed = 0;

        try {
            if (kind === "ui") {
                const result = await fetchClient(
                    `/i18n/ui-messages?status=untranslated&take=10000`,
                );
                const ids = (result.items as UiMessageRow[]).map((m) => m.id);
                setProgress({ done: 0, total: ids.length, failed: 0 });
                if (ids.length === 0) {
                    toast.info("没有未翻译的文案");
                    return;
                }

                for (let i = 0; i < ids.length; i += UI_CHUNK_SIZE) {
                    if (cancelRef.current) break;
                    const chunk = ids.slice(i, i + UI_CHUNK_SIZE);
                    try {
                        const res = await fetchClient("/i18n/translate", {
                            method: "POST",
                            body: JSON.stringify({
                                targetLocale: TARGET_LOCALE,
                                uiMessageIds: chunk,
                            }),
                        });
                        failed += (
                            res.ui as Array<{ ok: boolean }> | undefined
                        )?.filter((r) => !r.ok).length ?? 0;
                    } catch {
                        failed += chunk.length;
                    }
                    setProgress({
                        done: Math.min(i + UI_CHUNK_SIZE, ids.length),
                        total: ids.length,
                        failed,
                    });
                }
            } else if (entityType) {
                const result = await fetchClient(
                    `/i18n/content?entityType=${entityType}&status=untranslated&take=10000`,
                );
                const rows = result.items as ContentRow[];
                setProgress({ done: 0, total: rows.length, failed: 0 });
                if (rows.length === 0) {
                    toast.info("没有未翻译的内容");
                    return;
                }

                for (let i = 0; i < rows.length; i++) {
                    if (cancelRef.current) break;
                    const row = rows[i];
                    if (!row) continue;
                    try {
                        const res = await fetchClient("/i18n/translate", {
                            method: "POST",
                            body: JSON.stringify({
                                targetLocale: TARGET_LOCALE,
                                content: [
                                    { entityType, entityId: row.entityId },
                                ],
                            }),
                        });
                        const fields = res.content?.[0]?.fields as
                            | Array<{ ok: boolean; error?: string }>
                            | undefined;
                        // “源字段为空”不算失败
                        if (
                            fields?.some(
                                (f) => !f.ok && f.error !== "源字段为空，跳过",
                            )
                        ) {
                            failed++;
                        }
                    } catch {
                        failed++;
                    }
                    setProgress({ done: i + 1, total: rows.length, failed });
                }
            }

            if (cancelRef.current) {
                toast.info("批量翻译已取消");
            } else if (failed > 0) {
                toast.warning(`批量翻译完成，${failed} 条失败（可单独重试）`);
            } else {
                toast.success("批量翻译完成");
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "批量翻译失败");
        } finally {
            setIsRunning(false);
            onDone();
        }
    };

    if (isRunning) {
        return (
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    <span className="tabular-nums">
                        {progress.done}/{progress.total}
                        {progress.failed > 0 && (
                            <span className="text-red-500">
                                （{progress.failed} 失败）
                            </span>
                        )}
                    </span>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        cancelRef.current = true;
                    }}
                >
                    取消
                </Button>
            </div>
        );
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => setConfirmOpen(true)}
            >
                <Sparkles className="mr-1.5 h-4 w-4" />
                AI 翻译全部未翻译
            </Button>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>批量 AI 翻译</DialogTitle>
                        <DialogDescription>
                            将调用 LLM 翻译所有未翻译的
                            {kind === "ui" ? "界面文案" : "内容"}
                            （目标语言：English）。翻译结果标记为“机翻”，
                            建议之后人工校对。确认开始？
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            className="bg-amber-500 hover:bg-amber-600"
                            onClick={run}
                        >
                            开始翻译
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
