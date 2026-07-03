"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchClient } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { StatusBadge } from "@/components/admin/translations/StatusBadge";
import {
    fieldLabel,
    type ContentFieldState,
} from "@/components/admin/translations/types";

const TARGET_LOCALE = "en";

interface DetailResponse {
    entityType: string;
    entityId: string;
    label: string;
    fields: Record<string, ContentFieldState>;
}

/** 文章翻译：上方 标题/摘要 字段对，下方 中文正文（只读）| 英文正文 左右分栏 */
export default function PostTranslationPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();

    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [translatingField, setTranslatingField] = useState<string | null>(
        null,
    );

    // 自动保存：编辑计数 + 2s 防抖（同 posts 编辑页模式）
    const [editVersion, setEditVersion] = useState(0);
    const debouncedVersion = useDebounce(editVersion, 2000);
    const valuesRef = useRef(values);
    valuesRef.current = values;

    const load = useCallback(async () => {
        try {
            const data: DetailResponse = await fetchClient(
                `/i18n/content/post/${id}?locale=${TARGET_LOCALE}`,
            );
            setDetail(data);
            const initial: Record<string, string> = {};
            for (const [field, state] of Object.entries(data.fields)) {
                initial[field] = state.translation ?? "";
            }
            setValues(initial);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "加载失败");
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const save = useCallback(
        async (options?: { silent?: boolean }) => {
            setIsSaving(true);
            try {
                await fetchClient(`/i18n/content/post/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        locale: TARGET_LOCALE,
                        fields: valuesRef.current,
                        status: "REVIEWED",
                    }),
                });
                setLastSaved(new Date());
                if (!options?.silent) toast.success("已保存");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "保存失败");
            } finally {
                setIsSaving(false);
            }
        },
        [id],
    );

    // 防抖触发静默自动保存
    useEffect(() => {
        if (debouncedVersion > 0) {
            save({ silent: true });
        }
    }, [debouncedVersion, save]);

    const setField = (field: string, value: string) => {
        setValues((prev) => ({ ...prev, [field]: value }));
        setEditVersion((v) => v + 1);
    };

    const translateField = async (field: string) => {
        setTranslatingField(field);
        try {
            const res = await fetchClient("/i18n/translate", {
                method: "POST",
                body: JSON.stringify({
                    targetLocale: TARGET_LOCALE,
                    content: [
                        { entityType: "post", entityId: id, fields: [field] },
                    ],
                }),
            });
            const result = res.content?.[0]?.fields?.find(
                (f: { field: string }) => f.field === field,
            );
            if (result?.ok) {
                const data: DetailResponse = await fetchClient(
                    `/i18n/content/post/${id}?locale=${TARGET_LOCALE}`,
                );
                setDetail(data);
                setValues((prev) => ({
                    ...prev,
                    [field]: data.fields[field]?.translation ?? prev[field] ?? "",
                }));
                toast.success(`${fieldLabel(field)} AI 翻译完成`);
            } else {
                toast.error(`翻译失败: ${result?.error ?? "未知错误"}`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "翻译失败");
        } finally {
            setTranslatingField(null);
        }
    };

    if (!detail) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                加载中…
            </div>
        );
    }

    const shortFields = ["title", "excerpt"].filter(
        (f) => detail.fields[f]?.source,
    );
    const content = detail.fields.content;

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            {/* 顶部栏 */}
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/85 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push("/translations")}
                        >
                            <ArrowLeft className="mr-1.5 h-4 w-4" />
                            返回
                        </Button>
                        <h1 className="max-w-xl truncate text-lg font-semibold text-gray-900">
                            翻译文章：{detail.label}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {lastSaved && (
                            <span className="text-xs text-gray-400">
                                已自动保存 {lastSaved.toLocaleTimeString("zh-CN")}
                            </span>
                        )}
                        <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-600"
                            onClick={() => save()}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-1.5 h-4 w-4" />
                            )}
                            保存
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
                {/* 标题 / 摘要 */}
                {shortFields.map((field) => {
                    const state = detail.fields[field]!;
                    return (
                        <div key={field}>
                            <div className="mb-1.5 flex items-center gap-2">
                                <Label className="text-sm font-semibold text-gray-700">
                                    {fieldLabel(field)}
                                </Label>
                                <StatusBadge
                                    status={state.status}
                                    stale={state.stale}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2"
                                    disabled={translatingField !== null}
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
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    value={state.source ?? ""}
                                    readOnly
                                    className="bg-gray-50 text-gray-600"
                                />
                                <Input
                                    value={values[field] ?? ""}
                                    onChange={(e) =>
                                        setField(field, e.target.value)
                                    }
                                    placeholder="English…"
                                />
                            </div>
                        </div>
                    );
                })}

                {/* 正文左右分栏 */}
                {content?.source && (
                    <div>
                        <div className="mb-1.5 flex items-center gap-2">
                            <Label className="text-sm font-semibold text-gray-700">
                                正文（Markdown）
                            </Label>
                            <StatusBadge
                                status={content.status}
                                stale={content.stale}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2"
                                disabled={translatingField !== null}
                                onClick={() => translateField("content")}
                                title="AI 翻译正文（长文自动分块）"
                            >
                                {translatingField === "content" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                )}
                            </Button>
                            <span className="text-xs text-gray-400">
                                左侧中文只读，右侧英文可编辑
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Textarea
                                value={content.source}
                                readOnly
                                className="h-[65vh] resize-none bg-gray-50 font-mono text-xs leading-relaxed text-gray-600"
                            />
                            <Textarea
                                value={values.content ?? ""}
                                onChange={(e) =>
                                    setField("content", e.target.value)
                                }
                                placeholder="English Markdown…"
                                className="h-[65vh] resize-none font-mono text-xs leading-relaxed"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
