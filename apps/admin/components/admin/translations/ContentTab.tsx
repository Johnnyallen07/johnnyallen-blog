"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { fetchClient } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { StatusBadge } from "./StatusBadge";
import { BatchTranslateButton } from "./BatchTranslateButton";
import { ContentEditDialog } from "./ContentEditDialog";
import { fieldLabel, type ContentRow, type ContentTypeMeta } from "./types";

const PAGE_SIZE = 30;
const TARGET_LOCALE = "en";

/** 内容翻译行 */
function ContentRowItem({
    row,
    entityType,
    onEdit,
    onChanged,
}: {
    row: ContentRow;
    entityType: string;
    onEdit: () => void;
    onChanged: () => void;
}) {
    const router = useRouter();
    const [isTranslating, setIsTranslating] = useState(false);

    const translate = async () => {
        setIsTranslating(true);
        try {
            const res = await fetchClient("/i18n/translate", {
                method: "POST",
                body: JSON.stringify({
                    targetLocale: TARGET_LOCALE,
                    content: [{ entityType, entityId: row.entityId }],
                }),
            });
            const fields = res.content?.[0]?.fields as
                | Array<{ field: string; ok: boolean; error?: string }>
                | undefined;
            const realFailures =
                fields?.filter(
                    (f) => !f.ok && f.error !== "源字段为空，跳过",
                ) ?? [];
            if (realFailures.length > 0) {
                toast.error(
                    `部分字段失败: ${realFailures
                        .map((f) => `${fieldLabel(f.field)}(${f.error})`)
                        .join("；")}`,
                );
            } else {
                toast.success("AI 翻译完成");
            }
            onChanged();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "翻译失败");
        } finally {
            setIsTranslating(false);
        }
    };

    const openEditor = () => {
        if (entityType === "post") {
            router.push(`/translations/content/post/${row.entityId}`);
        } else {
            onEdit();
        }
    };

    return (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-amber-200 transition-colors">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                    {row.label}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {Object.entries(row.fields)
                        .filter(([, state]) => state.source)
                        .map(([field, state]) => (
                            <span
                                key={field}
                                className="flex items-center gap-1 text-xs text-gray-500"
                            >
                                {fieldLabel(field)}
                                <StatusBadge
                                    status={state.status}
                                    stale={state.stale}
                                />
                            </span>
                        ))}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={translate}
                    disabled={isTranslating}
                    title="AI 翻译全部字段"
                >
                    {isTranslating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Sparkles className="h-4 w-4 text-amber-500" />
                    )}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={openEditor}
                    title="编辑翻译"
                >
                    <Pencil className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

export function ContentTab() {
    const [contentTypes, setContentTypes] = useState<ContentTypeMeta[]>([]);
    const [entityType, setEntityType] = useState("post");
    const [items, setItems] = useState<ContentRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("all");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 400);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    useEffect(() => {
        fetchClient("/i18n/content-types")
            .then((types: ContentTypeMeta[]) => setContentTypes(types))
            .catch(() => toast.error("加载内容类型失败"));
    }, []);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("entityType", entityType);
            if (statusFilter !== "all") params.set("status", statusFilter);
            if (debouncedSearch) params.set("search", debouncedSearch);
            params.set("skip", String((page - 1) * PAGE_SIZE));
            params.set("take", String(PAGE_SIZE));
            const result = await fetchClient(`/i18n/content?${params}`);
            setItems(result.items ?? []);
            setTotal(result.total ?? 0);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "加载失败");
        } finally {
            setIsLoading(false);
        }
    }, [entityType, statusFilter, debouncedSearch, page]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setPage(1);
    }, [entityType, statusFilter, debouncedSearch]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div>
            {/* 筛选栏 */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <Select value={entityType} onValueChange={setEntityType}>
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {contentTypes.map((type) => (
                            <SelectItem
                                key={type.entityType}
                                value={type.entityType}
                            >
                                {type.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索标题 / 译文…"
                        className="pl-9"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部状态</SelectItem>
                        <SelectItem value="untranslated">有未翻译</SelectItem>
                        <SelectItem value="machine">含机翻</SelectItem>
                        <SelectItem value="reviewed">全部已校对</SelectItem>
                        <SelectItem value="stale">已过期</SelectItem>
                    </SelectContent>
                </Select>
                <div className="ml-auto">
                    <BatchTranslateButton
                        kind="content"
                        entityType={entityType}
                        onDone={load}
                    />
                </div>
            </div>

            {/* 列表 */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    加载中…
                </div>
            ) : items.length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">
                    暂无内容
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((row) => (
                        <ContentRowItem
                            key={row.entityId}
                            row={row}
                            entityType={entityType}
                            onEdit={() => {
                                setEditingId(row.entityId);
                                setDialogOpen(true);
                            }}
                            onChanged={load}
                        />
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

            <ContentEditDialog
                entityType={entityType}
                entityId={editingId}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSaved={load}
            />
        </div>
    );
}
