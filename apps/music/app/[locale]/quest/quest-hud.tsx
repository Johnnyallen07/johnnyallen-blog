/**
 * Gamification chrome for 视唱练耳: the level/XP header, the key ladder map,
 * the per-round reward card and the badge shelf. Presentation only — every
 * number comes from `lib/quest/gamification.ts`.
 */

import { useTranslations } from "next-intl";
import { Check, Flame, Lock, Star, Zap } from "lucide-react";

import { type BadgeId, levelForXp, type PlayerProgress } from "@/lib/quest/gamification";
import type { KeyStage } from "@/lib/quest/keys";

type T = ReturnType<typeof useTranslations<"quest">>;

export const ALL_BADGES: readonly BadgeId[] = [
    "first_blood",
    "flawless",
    "dead_centre",
    "no_hints",
    "combo_5",
    "combo_10",
    "week_streak",
    "key_cleared",
    "both_voices",
    "ladder_complete",
    "sharp_ears",
    "interval_master",
    "chord_master",
];

export const BADGE_EMOJI: Record<BadgeId, string> = {
    first_blood: "🎉",
    flawless: "💎",
    dead_centre: "🎯",
    no_hints: "🧠",
    combo_5: "⚡",
    combo_10: "🌩️",
    week_streak: "📅",
    key_cleared: "🔑",
    both_voices: "🎻",
    ladder_complete: "👑",
    sharp_ears: "🦅",
    interval_master: "📐",
    chord_master: "🎹",
};

export function ProgressHud({ progress, t }: { progress: PlayerProgress; t: T }) {
    const { level, into, needed } = levelForXp(progress.xp);
    const pct = needed > 0 ? Math.min(100, (into / needed) * 100) : 100;
    return (
        <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
                <span className="rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                    {t("hud.level", { level })}
                </span>
                <div className="hidden w-24 sm:block" title={t("hud.xp", { into, needed })}>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            </div>
            <span className="inline-flex items-center gap-1 text-orange-600" title={t("hud.dayStreakTitle")}>
                <Flame className="h-4 w-4" />
                {progress.dayStreak}
            </span>
            {progress.combo > 1 && (
                <span className="inline-flex items-center gap-1 text-violet-600" title={t("hud.comboTitle")}>
                    <Zap className="h-4 w-4" />×{progress.combo}
                </span>
            )}
            <span className="inline-flex items-center gap-1 text-gray-600">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {progress.totalStars}
            </span>
        </div>
    );
}

/** Whether `stage` may be played: the first key always, then each key once its predecessor is cleared. */
export function isKeyUnlocked(ladder: readonly KeyStage[], index: number, cleared: readonly string[]): boolean {
    if (index <= 0) return true;
    const stage = ladder[index];
    const prev = ladder[index - 1];
    return (stage !== undefined && cleared.includes(stage.id)) || (prev !== undefined && cleared.includes(prev.id));
}

export function KeyLadder({
    ladder,
    selectedId,
    cleared,
    disabled,
    onSelect,
    t,
}: {
    ladder: readonly KeyStage[];
    selectedId: string;
    cleared: readonly string[];
    disabled: boolean;
    onSelect: (stage: KeyStage) => void;
    t: T;
}) {
    return (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {ladder.map((stage, i) => {
                const unlocked = isKeyUnlocked(ladder, i, cleared);
                const done = cleared.includes(stage.id);
                const selected = stage.id === selectedId;
                return (
                    <div key={stage.id} className="flex items-center gap-1">
                        {i > 0 && <div className={`h-0.5 w-3 shrink-0 rounded ${unlocked ? "bg-teal-300" : "bg-gray-200"}`} />}
                        <button
                            type="button"
                            disabled={disabled || !unlocked}
                            onClick={() => onSelect(stage)}
                            title={unlocked ? t(`keys.${stage.id}`) : t("keyLocked")}
                            className={`relative flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl border px-2 text-sm font-semibold transition-all ${
                                selected
                                    ? "border-teal-500 bg-teal-600 text-white shadow-md"
                                    : unlocked
                                        ? "border-teal-200 bg-white text-teal-800 hover:bg-teal-50"
                                        : "border-gray-200 bg-gray-50 text-gray-300"
                            }`}
                        >
                            {unlocked ? <span>{t(`keysShort.${stage.id}`)}</span> : <Lock className="h-4 w-4" />}
                            {done && (
                                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-white shadow">
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export interface RewardInfo {
    xpGained: number;
    leveledUp: boolean;
    level: number;
    combo: number;
    unlocked: BadgeId[];
    keyUnlocked: string | null;
}

export function RewardCard({ reward, stars, t }: { reward: RewardInfo; stars: number; t: T }) {
    return (
        <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                {t("reward.xp", { xp: reward.xpGained })}
            </span>
            {reward.combo > 1 && stars > 0 && (
                <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-700">
                    {t("reward.combo", { count: reward.combo })}
                </span>
            )}
            {reward.leveledUp && (
                <span className="animate-bounce rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-sm font-bold text-white shadow">
                    {t("reward.levelUp", { level: reward.level })}
                </span>
            )}
            {reward.keyUnlocked && (
                <span className="rounded-full bg-teal-600 px-3 py-1 text-sm font-bold text-white shadow">
                    🔓 {t("reward.keyUnlocked", { key: t(`keys.${reward.keyUnlocked}`) })}
                </span>
            )}
            {reward.unlocked.map(id => (
                <span key={id} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
                    {BADGE_EMOJI[id]} {t(`badges.${id}.name`)}
                </span>
            ))}
        </div>
    );
}

export function BadgeShelf({ earned, t }: { earned: readonly BadgeId[]; t: T }) {
    return (
        <details className="group rounded-2xl border border-gray-100 bg-white px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-gray-600">
                🏅 {t("badgesTitle", { count: earned.length, total: ALL_BADGES.length })}
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {ALL_BADGES.map(id => {
                    const has = earned.includes(id);
                    return (
                        <div
                            key={id}
                            title={t(`badges.${id}.desc`)}
                            className={`flex flex-col items-center rounded-xl border px-2 py-2 text-center ${has ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50 opacity-50 grayscale"}`}
                        >
                            <span className="text-2xl">{BADGE_EMOJI[id]}</span>
                            <span className="mt-1 text-[11px] font-medium text-gray-700">{t(`badges.${id}.name`)}</span>
                            <span className="text-[10px] leading-tight text-gray-400">{t(`badges.${id}.desc`)}</span>
                        </div>
                    );
                })}
            </div>
        </details>
    );
}
