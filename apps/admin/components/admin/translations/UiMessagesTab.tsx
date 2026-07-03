"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchClient } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { StatusBadge } from "./StatusBadge";
import { BatchTranslateButton } from "./BatchTranslateButton";
import type { UiMessageRow } from "./types";

const PAGE_SIZE = 50;
const TARGET_LOCALE = "en";

/** 单行：中文原文 + 英文内联编辑 + 状态 + 行内 AI 翻译 */
function MessageRow({
    row,
    onSaved,
}: {
    row: UiMessageRow;
    onSaved: () => void;
}) {
    const [text, setText] = useState(row.translation?.text ?? "");
    const [isSaving, setIsSaving] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);

    // 行数据刷新后同步本地输入
    useEffect(() => {
        setText(row.translation?.text ?? "");
    }, [row.translation?.text]);

    const save = async () => {
        const trimmed = text.trim();
        if (trimmed === (row.translation?.text ?? "") || trimmed === "") return;
        setIsSaving(true);
        try {
            await fetchClient(
                `/i18n/ui-messages/${row.id}/translations/${TARGET_LOCALE}`,
                {
                    method: "PUT",
                    body: JSON.stringify({ text: trimmed, status: "REVIEWED" }),
                },
            );
            toast.success("已保存", { duration: 1500 });
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "保存失败");
        } finally {
            setIsSaving(false);
        }
    };

    const translate = async () => {
        setIsTranslating(true);
        try {
            const result = await fetchClient("/i18n/translate", {
                method: "POST",
                body: JSON.stringify({
                    targetLocale: TARGET_LOCALE,
                    uiMessageIds: [row.id],
                }),
            });
            const item = result?.ui?.[0];
            if (item?.ok) {
                toast.success("AI 翻译完成");
                onSaved();
            } else {
                toast.error(`翻译失败: ${item?.error ?? "未知错误"}`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "翻译失败");
        } finally {
            setIsTranslating(false);
        }
    };

    return (
        <div className="grid grid-cols-12 items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-amber-200 transition-colors">
            {/* Key + 来源 */}
            <div className="col-span-3 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="border-gray-200 bg-gray-50 text-gray-500">
                        {row.app}
                    </Badge>
                    <Badge className="border-violet-200 bg-violet-50 text-violet-600">
                        {row.namespace}
                    </Badge>
                </div>
                <div className="mt-1 flex items-center gap-1">
                    <p
                        className="truncate font-mono text-xs text-gray-600"
                        title={`${row.namespace}.${row.key}`}
                    >
                        {row.key}
                    </p>
                    {row.locations.length > 0 && (
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="shrink-0 cursor-help text-gray-400">
                                        <MapPin className="h-3 w-3" />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-md">
                                    <p className="mb-1 font-semibold">来源位置</p>
                                    {row.locations.slice(0, 8).map((loc) => (
                                        <p key={loc} className="font-mono text-xs">
                                            {loc}
                                        </p>
                                    ))}
                                    {row.locations.length > 8 && (
                                        <p className="text-xs text-gray-400">
                                            …共 {row.locations.length} 处
                                        </p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>

            {/* 中文原文 */}
            <div className="col-span-4 min-w-0">
                <p className="whitespace-pre-wrap break-words text-sm text-gray-900">
                    {row.sourceText}
                </p>
            </div>

            {/* 英文译文（内联编辑，失焦保存） */}
            <div className="col-span-4 min-w-0">
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={save}
                    placeholder="English translation…"
                    disabled={isSaving}
                    rows={Math.min(4, Math.max(1, Math.ceil(text.length / 50)))}
                    className="min-h-9 resize-y border-gray-200 text-sm"
                />
            </div>

            {/* 状态 + AI */}
            <div className="col-span-1 flex flex-col items-end gap-2">
                <StatusBadge
                    status={row.translation?.status ?? null}
                    stale={row.translation?.stale}
                    orphaned={row.orphaned}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={translate}
                    disabled={isTranslating}
                    title="AI 翻译此条"
                >
                    {isTranslating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    )}
                </Button>
            </div>
        </div>
    );
}

export function UiMessagesTab() {
    const [items, setItems] = useState<UiMessageRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [appFilter, setAppFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 400);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (appFilter !== "all") params.set("app", appFilter);
            if (statusFilter !== "all") params.set("status", statusFilter);
            if (debouncedSearch) params.set("search", debouncedSearch);
            params.set("skip", String((page - 1) * PAGE_SIZE));
            params.set("take", String(PAGE_SIZE));
            const result = await fetchClient(`/i18n/ui-messages?${params}`);
            setItems(result.items ?? []);
            setTotal(result.total ?? 0);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "加载失败");
        } finally {
            setIsLoading(false);
        }
    }, [appFilter, statusFilter, debouncedSearch, page]);

    useEffect(() => {
        load();
    }, [load]);

    // 筛选变化时回到第一页
    useEffect(() => {
        setPage(1);
    }, [appFilter, statusFilter, debouncedSearch]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div>
            {/* 筛选栏 */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索 key / 中文 / 英文…"
                        className="pl-9"
                    />
                </div>
                <Select value={appFilter} onValueChange={setAppFilter}>
                    <SelectTrigger className="w-32">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部应用</SelectItem>
                        <SelectItem value="web">web 博客</SelectItem>
                        <SelectItem value="music">music 音乐</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        <SelectItem value="untranslated">未翻译</SelectItem>
                        <SelectItem value="machine">机翻</SelectItem>
                        <SelectItem value="reviewed">已校对</SelectItem>
                        <SelectItem value="stale">已过期</SelectItem>
                        <SelectItem value="orphaned">已废弃</SelectItem>
                    </SelectContent>
                </Select>
                <div className="ml-auto">
                    <BatchTranslateButton kind="ui" onDone={load} />
                </div>
            </div>

            {/* 表头 */}
            <div className="mb-2 grid grid-cols-12 gap-3 px-4 text-xs font-medium uppercase tracking-wider text-gray-400">
                <div className="col-span-3">Key / 来源</div>
                <div className="col-span-4">中文原文</div>
                <div className="col-span-4">English</div>
                <div className="col-span-1 text-right">状态</div>
            </div>

            {/* 列表 */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    加载中…
                </div>
            ) : items.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                    暂无文案。请先运行 <code className="rounded bg-gray-100 px-1">pnpm i18n:sync</code> 同步前端 zh.json。
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((row) => (
                        <MessageRow key={row.id} row={row} onSaved={load} />
                    ))}
                </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        上一页
                    </Button>
                    <span className="text-gray-500">
                        {page} / {totalPages}（共 {total} 条）
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        下一页
                    </Button>
                </div>
            )}
        </div>
    );
}
