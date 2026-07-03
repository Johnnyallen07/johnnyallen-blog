"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { fetchClient } from "@/lib/api";
import { StatusBadge } from "./StatusBadge";
import { fieldLabel, type ContentFieldState } from "./types";

const TARGET_LOCALE = "en";

interface DetailResponse {
    entityType: string;
    entityId: string;
    label: string;
    fields: Record<string, ContentFieldState>;
}

/** 简单实体的翻译编辑弹窗：每字段 [中文只读 | 英文可编辑 | 字段级 AI] */
export function ContentEditDialog({
    entityType,
    entityId,
    open,
    onOpenChange,
    onSaved,
}: {
    entityType: string;
    entityId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [translatingField, setTranslatingField] = useState<string | null>(
        null,
    );

    useEffect(() => {
        if (!open || !entityId) return;
        setDetail(null);
        fetchClient(`/i18n/content/${entityType}/${entityId}?locale=${TARGET_LOCALE}`)
            .then((data: DetailResponse) => {
                setDetail(data);
                const initial: Record<string, string> = {};
                for (const [field, state] of Object.entries(data.fields)) {
                    initial[field] = state.translation ?? "";
                }
                setValues(initial);
            })
            .catch((err) =>
                toast.error(err instanceof Error ? err.message : "加载失败"),
            );
    }, [open, entityType, entityId]);

    const save = async () => {
        if (!entityId) return;
        setIsSaving(true);
        try {
            await fetchClient(`/i18n/content/${entityType}/${entityId}`, {
                method: "PUT",
                body: JSON.stringify({
                    locale: TARGET_LOCALE,
                    fields: values,
                    status: "REVIEWED",
                }),
            });
            toast.success("已保存");
            onOpenChange(false);
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "保存失败");
        } finally {
            setIsSaving(false);
        }
    };

    const translateField = async (field: string) => {
        if (!entityId) return;
        setTranslatingField(field);
        try {
            const res = await fetchClient("/i18n/translate", {
                method: "POST",
                body: JSON.stringify({
                    targetLocale: TARGET_LOCALE,
                    content: [{ entityType, entityId, fields: [field] }],
                }),
            });
            const result = res.content?.[0]?.fields?.find(
                (f: { field: string }) => f.field === field,
            );
            if (result?.ok) {
                // 重新拉取译文回填
                const data: DetailResponse = await fetchClient(
                    `/i18n/content/${entityType}/${entityId}?locale=${TARGET_LOCALE}`,
                );
                setDetail(data);
                setValues((prev) => ({
                    ...prev,
                    [field]: data.fields[field]?.translation ?? prev[field] ?? "",
                }));
                toast.success("AI 翻译完成");
            } else {
                toast.error(`翻译失败: ${result?.error ?? "未知错误"}`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "翻译失败");
        } finally {
            setTranslatingField(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        编辑翻译{detail ? ` — ${detail.label}` : ""}
                    </DialogTitle>
                </DialogHeader>

                {!detail ? (
                    <div className="flex items-center justify-center py-10 text-gray-400">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        加载中…
                    </div>
                ) : (
                    <div className="space-y-5">
                        {Object.entries(detail.fields).map(([field, state]) => (
                            <div key={field}>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <Label className="text-sm font-semibold text-gray-700">
                                        {fieldLabel(field)}
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge
                                            status={state.status}
                                            stale={state.stale}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2"
                                            disabled={
                                                !state.source ||
                                                translatingField !== null
                                            }
                                            onClick={() => translateField(field)}
                                            title="AI 翻译此字段"
                                        >
                                            {translatingField === field ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                            )}
                                        </Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Textarea
                                        value={state.source ?? "（空）"}
                                        readOnly
                                        rows={2}
                                        className="resize-y bg-gray-50 text-sm text-gray-600"
                                    />
                                    <Textarea
                                        value={values[field] ?? ""}
                                        onChange={(e) =>
                                            setValues((prev) => ({
                                                ...prev,
                                                [field]: e.target.value,
                                            }))
                                        }
                                        placeholder="English…"
                                        rows={2}
                                        className="resize-y text-sm"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button
                        className="bg-amber-500 hover:bg-amber-600"
                        onClick={save}
                        disabled={isSaving || !detail}
                    >
                        {isSaving && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
