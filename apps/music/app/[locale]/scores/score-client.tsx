"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, BookOpen, Search, ChevronRight } from "lucide-react";
import { ScoreReader } from "@repo/ui/score-reader";
import type { PageAnnotations } from "@repo/ui/score-model";
import { getApiBaseUrl, withLocale } from "@/lib/api";

/* ───────── Types ───────── */

interface MusicScore {
    id: string;
    title: string;
    composer: string | null;
    instrument: string;
    fileType?: string;
    pages?: { key: string; url: string }[] | null;
    fileUrl: string;
    fileSize: number;
    pageCount: number;
    annotations?: PageAnnotations[] | null;
}

/* ───────── Constants ───────── */

const API_BASE = getApiBaseUrl();

// value 是数据库里的乐器规范值（中文，兼作筛选键），label 走翻译
const INSTRUMENTS = [
    { value: "all", labelKey: "filterAll", emoji: "" },
    { value: "小提琴", labelKey: "violin", emoji: "🎻 " },
    { value: "钢琴", labelKey: "piano", emoji: "🎹 " },
] as const;

/** 已知乐器名的展示翻译；未知值原样展示 */
function instrumentLabel(
    value: string,
    t: (key: string) => string,
): string {
    if (value === "小提琴") return t("violin");
    if (value === "钢琴") return t("piano");
    return value;
}

/* ───────── Score List Item ───────── */

function ScoreListItem({
    score,
    onClick,
}: {
    score: MusicScore;
    onClick: () => void;
}) {
    const t = useTranslations("scores");
    return (
        <button
            onClick={onClick}
            className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-amber-300/70 hover:bg-white hover:shadow-md"
        >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200/70 bg-amber-50 text-amber-600">
                <BookOpen className="h-5 w-5" />
            </div>

            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-950">
                        {score.title}
                    </h3>
                    <span className="hidden shrink-0 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] text-slate-500 sm:inline-flex">
                        {t("pageCount", { count: score.pageCount })}
                    </span>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                    {score.composer && <span className="truncate">{score.composer}</span>}
                    {score.composer && <span className="text-slate-300">/</span>}
                    <span className="truncate">{instrumentLabel(score.instrument, t)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 sm:inline-flex">
                    {instrumentLabel(score.instrument, t)}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
            </div>
        </button>
    );
}

/* ───────── Main Page ───────── */

export default function ScorePageClient() {
    const t = useTranslations("scores");
    const locale = useLocale();
    const [scores, setScores] = useState<MusicScore[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterInstrument, setFilterInstrument] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewingScore, setViewingScore] = useState<MusicScore | null>(null);
    const hasHandledInitialScoreRef = useRef(false);

    const fetchScores = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = filterInstrument !== "all" ? `?instrument=${encodeURIComponent(filterInstrument)}` : "";
            const res = await fetch(withLocale(`${API_BASE}/music-scores${params}`, locale));
            if (!res.ok) return;
            const data = await res.json();
            setScores(Array.isArray(data) ? data : []);
        } catch {
            setScores([]);
        } finally {
            setIsLoading(false);
        }
    }, [filterInstrument, locale]);

    useEffect(() => {
        fetchScores();
    }, [fetchScores]);

    useEffect(() => {
        if (hasHandledInitialScoreRef.current || scores.length === 0) return;
        const scoreId = new URLSearchParams(window.location.search).get("score");
        if (!scoreId) return;

        const score = scores.find((item) => item.id === scoreId);
        if (score) {
            setViewingScore(score);
            hasHandledInitialScoreRef.current = true;
        }
    }, [scores]);

    const filteredScores = scores.filter((score) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;

        return [score.title, score.composer, score.instrument]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query));
    });

    const openScore = (score: MusicScore) => {
        setViewingScore(score);
        const url = new URL(window.location.href);
        url.searchParams.set("score", score.id);
        window.history.replaceState(null, "", url.toString());
    };

    const closeScore = () => {
        setViewingScore(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("score");
        window.history.replaceState(null, "", url.toString());
    };

    if (viewingScore) {
        return (
            <ScoreReader locale={locale}
                score={viewingScore}
                onClose={closeScore}
            />
        );
    }

    return (
        <div className="min-h-screen bg-[#f8f6f1]">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/70 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-amber-600" />
                                <div>
                                    <h1 className="text-lg font-semibold text-slate-950">{t("title")}</h1>
                                    <p className="text-xs text-slate-500">{t("subtitle")}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative sm:w-72">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder={t("searchPlaceholder")}
                                    className="w-full rounded-xl border border-slate-200/80 bg-white/70 py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                />
                            </div>

                            <div className="flex rounded-xl border border-slate-200/70 bg-white/60 p-0.5">
                                {INSTRUMENTS.map((inst) => (
                                    <button
                                        key={inst.value}
                                        onClick={() => setFilterInstrument(inst.value)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                            filterInstrument === inst.value
                                                ? "bg-amber-500 text-white shadow-sm"
                                                : "text-slate-600 hover:text-slate-950"
                                        }`}
                                    >
                                        {inst.emoji}{t(inst.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Score list */}
            <div className="max-w-6xl mx-auto px-6 py-8">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-3" />
                        <p className="text-sm">{t("loading")}</p>
                    </div>
                ) : filteredScores.length > 0 ? (
                    <div className="space-y-3">
                        <div className="hidden grid-cols-[auto_1fr_auto] gap-4 px-4 text-xs font-medium uppercase tracking-wider text-slate-400 md:grid">
                            <span className="w-11" />
                            <span>{t("colTitleComposer")}</span>
                            <span className="pr-7 text-right">{t("colInstrument")}</span>
                        </div>
                        {filteredScores.map((score) => (
                            <ScoreListItem
                                key={score.id}
                                score={score}
                                onClick={() => openScore(score)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <BookOpen className="w-12 h-12 mb-3 text-slate-300" />
                        <p className="text-sm">{searchQuery ? t("noMatchingScores") : t("noScores")}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
