/**
 * Tap-to-answer ear-training drills (比高低 / 音程 / 和弦).
 *
 * Owns the question loop and per-drill level; the parent owns audio output and
 * the shared progress, and is told about each answer through `onAnswer`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, RotateCcw, Volume2, X } from "lucide-react";

import { advanceDrill, DRILL_MAX_LEVEL, type DrillEvent, type DrillId, type DrillQuestion, generateDrill, PROMOTE_AFTER } from "@/lib/quest/drills";
import type { VoiceRange } from "@/lib/quest/keys";
import { noteName } from "@/lib/quest/theory";

type T = ReturnType<typeof useTranslations<"quest">>;

const STORE_KEY = "fiddle-quest-drills-v1";

type LevelState = Record<DrillId, { level: number; run: number }>;

const FRESH: LevelState = { compare: { level: 1, run: 0 }, interval: { level: 1, run: 0 }, chord: { level: 1, run: 0 } };

function loadLevels(): LevelState {
    try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return FRESH;
        const parsed = JSON.parse(raw) as Partial<LevelState>;
        const out = { ...FRESH };
        for (const id of Object.keys(FRESH) as DrillId[]) {
            const v = parsed[id];
            if (v && typeof v.level === "number" && typeof v.run === "number") {
                out[id] = { level: Math.max(1, Math.min(DRILL_MAX_LEVEL[id], v.level)), run: Math.max(0, v.run) };
            }
        }
        return out;
    } catch {
        return FRESH;
    }
}

export function DrillPanel({
    drill,
    voice,
    play,
    onAnswer,
    footer,
    t,
}: {
    drill: DrillId;
    voice: VoiceRange;
    /** Plays the events; resolves when playback ends. */
    play: (events: DrillEvent[]) => Promise<void>;
    /** Called once per answered question. `maxed` is true when this answer reached the drill's top level. */
    onAnswer: (correct: boolean, drill: DrillId, maxed: boolean) => void;
    /** Rendered under the answer buttons (the reward chips). */
    footer?: React.ReactNode;
    t: T;
}) {
    const [levels, setLevels] = useState<LevelState>(FRESH);
    const [question, setQuestion] = useState<DrillQuestion | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);
    const [promoted, setPromoted] = useState(false);
    const [tally, setTally] = useState({ right: 0, total: 0 });
    const advanceTimer = useRef<number | null>(null);

    useEffect(() => setLevels(loadLevels()), []);

    const level = levels[drill].level;

    const playQuestion = useCallback(
        async (q: DrillQuestion) => {
            setPlaying(true);
            try {
                await play(q.events);
            } finally {
                setPlaying(false);
            }
        },
        [play],
    );

    const next = useCallback(
        (atLevel?: number) => {
            if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
            const q = generateDrill({ drill, level: atLevel ?? level, voice });
            setQuestion(q);
            setPicked(null);
            setPromoted(false);
            void playQuestion(q);
        },
        [drill, level, playQuestion, voice],
    );

    // Switching drill or voice abandons the current question.
    useEffect(() => {
        setQuestion(null);
        setPicked(null);
        setTally({ right: 0, total: 0 });
    }, [drill, voice]);

    useEffect(() => () => {
        if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    }, []);

    const saveLevels = useCallback((nextLevels: LevelState) => {
        setLevels(nextLevels);
        try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify(nextLevels));
        } catch {
            // Private browsing denies localStorage.
        }
    }, []);

    const answer = useCallback(
        (choice: string) => {
            if (!question || picked !== null) return;
            const correct = choice === question.answer;
            setPicked(choice);
            setTally(prev => ({ right: prev.right + (correct ? 1 : 0), total: prev.total + 1 }));
            const step = advanceDrill(levels[drill], drill, correct);
            const maxed = step.promoted && step.level === DRILL_MAX_LEVEL[drill];
            saveLevels({ ...levels, [drill]: { level: step.level, run: step.run } });
            setPromoted(step.promoted);
            onAnswer(correct, drill, maxed);
            if (correct) {
                advanceTimer.current = window.setTimeout(() => next(step.level), step.promoted ? 1600 : 900);
            }
        },
        [drill, levels, next, onAnswer, picked, question, saveLevels],
    );

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
            if (!question) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    next();
                }
                return;
            }
            const n = Number(e.key);
            if (Number.isInteger(n) && n >= 1 && n <= question.choices.length) {
                answer(question.choices[n - 1]!);
            } else if (e.key === "r" || e.key === " ") {
                e.preventDefault();
                void playQuestion(question);
            } else if (e.key === "Enter" && picked !== null) {
                next();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [answer, next, picked, playQuestion, question]);

    const setLevel = (lv: number) => {
        saveLevels({ ...levels, [drill]: { level: lv, run: 0 } });
        next(lv);
    };

    const run = levels[drill].run;
    const max = DRILL_MAX_LEVEL[drill];

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full bg-gray-100 p-0.5">
                    {Array.from({ length: max }, (_, i) => i + 1).map(lv => (
                        <button
                            key={lv}
                            type="button"
                            disabled={playing}
                            onClick={() => setLevel(lv)}
                            title={t(`drills.${drill}.levels.${lv}`)}
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                                level === lv ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            L{lv}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-gray-500">{t(`drills.${drill}.levels.${level}`)}</span>
                {level < max && (
                    <span className="ml-auto flex items-center gap-1" title={t("drills.promoteHint", { count: PROMOTE_AFTER })}>
                        {Array.from({ length: PROMOTE_AFTER }, (_, i) => (
                            <span key={i} className={`h-2 w-2 rounded-full ${i < run ? "bg-teal-500" : "bg-gray-200"}`} />
                        ))}
                    </span>
                )}
                {tally.total > 0 && (
                    <span className={`text-xs tabular-nums text-gray-500 ${level < max ? "" : "ml-auto"}`}>
                        {tally.right}/{tally.total}
                    </span>
                )}
            </div>

            {!question ? (
                <div className="py-10 text-center">
                    <button
                        type="button"
                        onClick={() => next()}
                        className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-8 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:scale-105 hover:bg-teal-700"
                    >
                        <Volume2 className="h-5 w-5" />
                        {t("start")}
                    </button>
                    <p className="mt-3 text-xs text-gray-400">{t("drills.keysHint")}</p>
                </div>
            ) : (
                <div className="mt-5">
                    <div className="flex items-center justify-center gap-2">
                        <button
                            type="button"
                            disabled={playing}
                            onClick={() => void playQuestion(question)}
                            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200 transition-all hover:scale-105 disabled:opacity-60"
                            title={t("replay")}
                        >
                            {playing ? <Loader2 className="h-7 w-7 animate-spin" /> : <Volume2 className="h-7 w-7" />}
                        </button>
                    </div>

                    <div className={`mt-5 grid gap-2 ${question.choices.length <= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"}`}>
                        {question.choices.map((choice, i) => {
                            const isAnswer = choice === question.answer;
                            const isPicked = choice === picked;
                            const state = picked === null ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
                            return (
                                <button
                                    key={choice}
                                    type="button"
                                    disabled={picked !== null}
                                    onClick={() => answer(choice)}
                                    className={`relative rounded-2xl border px-3 py-3.5 text-sm font-semibold transition-all ${
                                        state === "right"
                                            ? "scale-105 border-emerald-400 bg-emerald-50 text-emerald-700"
                                            : state === "wrong"
                                                ? "animate-pulse border-rose-300 bg-rose-50 text-rose-700"
                                                : state === "dim"
                                                    ? "border-gray-100 bg-white text-gray-300"
                                                    : "border-gray-200 bg-white text-gray-800 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm"
                                    }`}
                                >
                                    <span className="absolute left-2 top-1.5 text-[10px] font-normal text-gray-300">{i + 1}</span>
                                    {state === "right" && <Check className="mr-1 inline h-4 w-4" />}
                                    {state === "wrong" && <X className="mr-1 inline h-4 w-4" />}
                                    {t(`drills.${drill}.choices.${choice}`)}
                                </button>
                            );
                        })}
                    </div>

                    {picked !== null && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <span className={`text-sm font-semibold ${picked === question.answer ? "text-emerald-600" : "text-rose-600"}`}>
                                {picked === question.answer ? t("drills.right") : t("drills.wrong", { answer: t(`drills.${drill}.choices.${question.answer}`) })}
                            </span>
                            {drill !== "compare" && (
                                <span className="text-xs text-gray-400">{question.pitches.map(p => noteName(p)).join(" – ")}</span>
                            )}
                            {promoted && (
                                <span className="animate-bounce rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 px-3 py-1 text-xs font-bold text-white">
                                    {t("drills.levelUp", { level: levels[drill].level })}
                                </span>
                            )}
                            {picked !== question.answer && (
                                <button
                                    type="button"
                                    onClick={() => next()}
                                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    {t("drills.next")}
                                </button>
                            )}
                        </div>
                    )}
                    {footer && <div className="mt-4">{footer}</div>}
                </div>
            )}
        </div>
    );
}
