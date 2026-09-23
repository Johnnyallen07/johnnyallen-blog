"use client";

/**
 * 扒谱闯关 — the ear-training drill.
 *
 * The loop is: hear a phrase, play it back on the violin, get graded on what
 * actually came out of the instrument. Everything runs in the browser; there is
 * no server round trip, which is what makes the "record, grade, retry" cycle
 * fast enough to be a game rather than a homework submission.
 *
 * All the musical judgement lives in `lib/quest/`. This file owns the state
 * machine, the audio plumbing handoff, and the drawing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, Loader2, Mic, Play, RotateCcw, Square, Star } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { createQuestAudioContext, openQuestRecorder, playSamples, type QuestRecorder } from "@/lib/quest-audio";
import { generateLick } from "@/lib/quest/licks";
import { createYinPitchDetector } from "@/lib/quest/pitchtrack";
import { segmentNotes } from "@/lib/quest/segment";
import { DEFAULT_SYNTH_CONFIG, renderLick } from "@/lib/quest/synth";
import { createHintLedger, FREE_REPLAYS, HINT_CATALOG, takeHint } from "@/lib/quest/hints";
import { scoreAttempt } from "@/lib/quest/scoring";
import { noteName } from "@/lib/quest/theory";
import type { Feedback, HintLedger, HintType, Lick, PitchTrack, Score, Tolerance } from "@/lib/quest/types";

type Phase = "idle" | "prompt" | "ready" | "recording" | "grading" | "result";

const WORLD_IDS = [1, 2, 3, 4, 5, 6];

/** Hints offered in the UI. `reveal_score` is excluded: there is no notation yet. */
const OFFERED_HINTS: HintType[] = ["slow_75", "slow_50", "reveal_key", "reveal_first_note"];

const TOLERANCES: Tolerance[] = [25, 15, 8];

const PROGRESS_KEY = "fiddle-quest-progress-v1";

interface StoredProgress {
    totalStars: number;
    streak: number;
    rounds: number;
}

function loadProgress(): StoredProgress {
    if (typeof window === "undefined") return { totalStars: 0, streak: 0, rounds: 0 };
    try {
        const raw = window.localStorage.getItem(PROGRESS_KEY);
        if (!raw) return { totalStars: 0, streak: 0, rounds: 0 };
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return { totalStars: 0, streak: 0, rounds: 0 };
        const p = parsed as Partial<StoredProgress>;
        return {
            totalStars: typeof p.totalStars === "number" ? p.totalStars : 0,
            streak: typeof p.streak === "number" ? p.streak : 0,
            rounds: typeof p.rounds === "number" ? p.rounds : 0,
        };
    } catch {
        return { totalStars: 0, streak: 0, rounds: 0 };
    }
}

/**
 * Draws the detected pitch against the target.
 *
 * A number is a verdict; a curve is a diagnosis. Seeing that a note started
 * flat and crept up tells you something "−18 cents" never will.
 */
function PitchCurve({ track, lick, height = 170 }: { track: PitchTrack; lick: Lick; height?: number }) {
    let loMidi = Infinity;
    let hiMidi = -Infinity;

    for (const note of lick.notes) {
        loMidi = Math.min(loMidi, note.midi);
        hiMidi = Math.max(hiMidi, note.midi);
    }
    for (let i = 0; i < track.times.length; i++) {
        if (!track.voiced[i]) continue;
        const midi = 69 + 12 * Math.log2(track.f0Hz[i]! / 440);
        loMidi = Math.min(loMidi, midi);
        hiMidi = Math.max(hiMidi, midi);
    }
    if (!Number.isFinite(loMidi) || !Number.isFinite(hiMidi)) return null;

    loMidi -= 1.5;
    hiMidi += 1.5;
    const span = Math.max(1, hiMidi - loMidi);
    const duration = track.times.length > 0 ? track.times[track.times.length - 1]! : 1;

    const toY = (midi: number) => height - ((midi - loMidi) / span) * height;
    const toX = (t: number) => (t / Math.max(duration, 0.001)) * 1000;

    let run: { x: number; y: number }[] = [];
    const runs: { x: number; y: number }[][] = [];
    for (let i = 0; i < track.times.length; i++) {
        if (track.voiced[i] && track.f0Hz[i]! > 0) {
            const midi = 69 + 12 * Math.log2(track.f0Hz[i]! / 440);
            run.push({ x: toX(track.times[i]!), y: toY(midi) });
        } else if (run.length > 0) {
            runs.push(run);
            run = [];
        }
    }
    if (run.length > 0) runs.push(run);

    const uniqueTargets = Array.from(new Set(lick.notes.map((n) => n.midi))).sort((a, b) => a - b);

    return (
        <svg viewBox={`0 0 1000 ${height}`} className="w-full h-[170px]" preserveAspectRatio="none">
            {uniqueTargets.map((midi) => (
                <g key={midi}>
                    <line x1={0} x2={1000} y1={toY(midi)} y2={toY(midi)} stroke="#10b981" strokeWidth={1} strokeDasharray="6 5" opacity={0.55} />
                    <text x={6} y={toY(midi) - 4} fontSize={11} fill="#059669">
                        {noteName(midi)}
                    </text>
                </g>
            ))}
            {runs.map((segment, index) => (
                <polyline
                    key={index}
                    points={segment.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth={2.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            ))}
        </svg>
    );
}

/** A signed cents error as a bar centred on zero, clamped at ±50. */
function CentsBar({ cents, tolerance }: { cents: number; tolerance: number }) {
    const clamped = Math.max(-50, Math.min(50, cents));
    const width = (Math.abs(clamped) / 50) * 50;
    const left = clamped < 0 ? 50 - width : 50;
    const inTune = Math.abs(cents) <= tolerance;
    return (
        <div className="relative h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
            <div
                className={`absolute inset-y-0 rounded-full ${inTune ? "bg-emerald-500" : Math.abs(cents) > 35 ? "bg-rose-500" : "bg-amber-400"}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
            />
        </div>
    );
}

export default function QuestPageClient() {
    const t = useTranslations("quest");

    const [world, setWorld] = useState(1);
    const [tolerance, setTolerance] = useState<Tolerance>(25);
    const [phase, setPhase] = useState<Phase>("idle");
    const [lick, setLick] = useState<Lick | null>(null);
    const [score, setScore] = useState<Score | null>(null);
    const [track, setTrack] = useState<PitchTrack | null>(null);
    const [ledger, setLedger] = useState<HintLedger>(() => createHintLedger());
    const [revealed, setRevealed] = useState<{ key: boolean; firstNote: boolean }>({ key: false, firstNote: false });
    const [error, setError] = useState("");
    const [progress, setProgress] = useState<StoredProgress>({ totalStars: 0, streak: 0, rounds: 0 });
    const [micReady, setMicReady] = useState(false);
    const [insecure, setInsecure] = useState(false);

    const contextRef = useRef<AudioContext | null>(null);
    const recorderRef = useRef<QuestRecorder | null>(null);
    const renderedRef = useRef<Float32Array | null>(null);
    const playbackRef = useRef<{ stop: () => void } | null>(null);

    useEffect(() => {
        setProgress(loadProgress());
        setInsecure(!window.isSecureContext);
    }, []);

    const persist = useCallback((next: StoredProgress) => {
        setProgress(next);
        try {
            window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
        } catch {
            // Private browsing denies localStorage; losing the streak is not
            // worth breaking the round over.
        }
    }, []);

    const ensureContext = useCallback(() => {
        if (!contextRef.current || contextRef.current.state === "closed") {
            contextRef.current = createQuestAudioContext();
        }
        return contextRef.current;
    }, []);

    useEffect(
        () => () => {
            void recorderRef.current?.close();
            recorderRef.current = null;
            const context = contextRef.current;
            contextRef.current = null;
            if (context && context.state !== "closed") void context.close();
        },
        [],
    );

    /** Synthesises the prompt at the context's own rate so nothing resamples. */
    const render = useCallback((target: Lick, tempoScale: number) => {
        const context = ensureContext();
        return renderLick(target, { ...DEFAULT_SYNTH_CONFIG, sr: context.sampleRate }, { tempoScale });
    }, [ensureContext]);

    const playPrompt = useCallback(
        async (target: Lick, tempoScale = 1) => {
            const context = ensureContext();
            await context.resume();
            const samples = tempoScale === 1 && renderedRef.current ? renderedRef.current : render(target, tempoScale);
            if (tempoScale === 1) renderedRef.current = samples;

            setPhase("prompt");
            playbackRef.current?.stop();
            const handle = playSamples(context, samples);
            playbackRef.current = handle;
            await handle.done;
            playbackRef.current = null;
            setPhase("ready");
        },
        [ensureContext, render],
    );

    const newRound = useCallback(
        async (targetWorld: number) => {
            setError("");
            setScore(null);
            setTrack(null);
            setRevealed({ key: false, firstNote: false });
            setLedger(createHintLedger());
            renderedRef.current = null;

            const next = generateLick({ world: targetWorld, seed: Math.floor(Math.random() * 2 ** 31) });
            setLick(next);
            await playPrompt(next);
        },
        [playPrompt],
    );

    const replay = useCallback(
        async (tempoScale = 1) => {
            if (!lick) return;
            if (tempoScale === 1) {
                setLedger((prev) => {
                    const copy: HintLedger = { used: [...prev.used], freeReplaysRemaining: prev.freeReplaysRemaining };
                    takeHint(copy, "replay");
                    return copy;
                });
            }
            await playPrompt(lick, tempoScale);
        },
        [lick, playPrompt],
    );

    const applyHint = useCallback(
        async (hint: HintType) => {
            if (!lick) return;
            setLedger((prev) => {
                const copy: HintLedger = { used: [...prev.used], freeReplaysRemaining: prev.freeReplaysRemaining };
                takeHint(copy, hint);
                return copy;
            });
            if (hint === "slow_75") await playPrompt(lick, 1 / 0.75);
            else if (hint === "slow_50") await playPrompt(lick, 2);
            else if (hint === "reveal_key") setRevealed((prev) => ({ ...prev, key: true }));
            else if (hint === "reveal_first_note") setRevealed((prev) => ({ ...prev, firstNote: true }));
        },
        [lick, playPrompt],
    );

    const startRecording = useCallback(async () => {
        setError("");
        try {
            const context = ensureContext();
            if (!recorderRef.current) {
                recorderRef.current = await openQuestRecorder(context);
                setMicReady(true);
            }
            recorderRef.current.start();
            setPhase("recording");
        } catch (err) {
            console.error(err);
            setError(t("errors.mic"));
            setPhase("ready");
        }
    }, [ensureContext, t]);

    const stopAndGrade = useCallback(async () => {
        const recorder = recorderRef.current;
        if (!recorder || !lick) return;

        const samples = recorder.stop();
        setPhase("grading");

        // Yield a frame so the spinner paints before the engine blocks the
        // main thread. The whole analysis is a few hundred milliseconds.
        await new Promise((resolve) => window.setTimeout(resolve, 0));

        try {
            const detect = createYinPitchDetector();
            const pitchTrack = detect(samples, recorder.sampleRate);
            const events = segmentNotes(pitchTrack);
            const result = scoreAttempt(lick, events, { tolerance, ledger });

            setTrack(pitchTrack);
            setScore(result);
            setPhase("result");

            persist({
                totalStars: progress.totalStars + result.stars,
                streak: result.stars > 0 ? progress.streak + 1 : 0,
                rounds: progress.rounds + 1,
            });
        } catch (err) {
            console.error(err);
            setError(t("errors.grading"));
            setPhase("ready");
        }
    }, [ledger, lick, persist, progress, t, tolerance]);

    const replaysLeft = ledger.freeReplaysRemaining;
    const busy = phase === "prompt" || phase === "grading";

    const noteRows = useMemo(() => {
        if (!score) return [];
        return score.noteScores;
    }, [score]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-white to-white">
            <div className="mx-auto max-w-4xl px-4 py-6 md:py-10">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-700 transition-colors">
                        <ChevronLeft className="h-4 w-4" />
                        {t("back")}
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            {progress.totalStars}
                        </span>
                        <span>{t("streak", { count: progress.streak })}</span>
                    </div>
                </div>

                <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">{t("title")}</h1>
                <p className="mt-2 text-sm text-gray-500 max-w-2xl">{t("subtitle")}</p>

                {insecure && (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {t("errors.insecureContext")}
                    </div>
                )}

                {/* ══════════ 关卡选择 ══════════ */}
                <div className="mt-7">
                    <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">{t("worldLabel")}</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {WORLD_IDS.map((id) => (
                            <button
                                key={id}
                                type="button"
                                disabled={busy || phase === "recording"}
                                onClick={() => {
                                    setWorld(id);
                                    setPhase("idle");
                                    setLick(null);
                                    setScore(null);
                                    setTrack(null);
                                }}
                                className={`text-left rounded-2xl border px-3.5 py-3 transition-all duration-200 disabled:opacity-50 ${
                                    world === id
                                        ? "border-emerald-400 bg-emerald-50/80 shadow-sm"
                                        : "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                                }`}
                            >
                                <div className="text-sm font-medium text-gray-800">
                                    {id}. {t(`worlds.${id}.name`)}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 leading-snug">{t(`worlds.${id}.blurb`)}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ══════════ 判定严格度 ══════════ */}
                <div className="mt-5 flex items-center gap-2 text-sm">
                    <span className="text-xs uppercase tracking-wider text-gray-400 mr-1">{t("toleranceLabel")}</span>
                    {TOLERANCES.map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setTolerance(value)}
                            className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                tolerance === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            {t(`tolerance.${value}`)}
                        </button>
                    ))}
                </div>

                {/* ══════════ 主面板 ══════════ */}
                <div className="mt-7 rounded-3xl border border-gray-200 bg-white p-5 md:p-7 shadow-sm">
                    {!lick ? (
                        <div className="py-10 text-center">
                            <p className="text-sm text-gray-500 mb-5">{t("startHint", { world: t(`worlds.${world}.name`) })}</p>
                            <button
                                type="button"
                                onClick={() => void newRound(world)}
                                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                            >
                                <Play className="h-4 w-4" />
                                {t("start")}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm text-gray-500">
                                    {t("roundMeta", { notes: lick.notes.length, bpm: Math.round(lick.tempoBpm) })}
                                    {revealed.key && <span className="ml-2 text-emerald-700">{t("revealedKey", { key: noteName(lick.tonicMidi) })}</span>}
                                    {revealed.firstNote && (
                                        <span className="ml-2 text-emerald-700">{t("revealedFirstNote", { note: noteName(lick.notes[0]!.midi) })}</span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-400">{t("phase." + phase)}</div>
                            </div>

                            <div className="mt-6 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    disabled={busy || phase === "recording"}
                                    onClick={() => void replay()}
                                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/60 transition-colors disabled:opacity-40"
                                >
                                    {phase === "prompt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                    {t("replay")}
                                    <span className="text-xs text-gray-400">{t("replaysLeft", { count: replaysLeft, total: FREE_REPLAYS })}</span>
                                </button>

                                {phase === "recording" ? (
                                    <button
                                        type="button"
                                        onClick={() => void stopAndGrade()}
                                        className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-700 transition-colors"
                                    >
                                        <Square className="h-4 w-4 fill-current" />
                                        {t("stop")}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void startRecording()}
                                        className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
                                    >
                                        {phase === "grading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                                        {phase === "grading" ? t("grading") : t("record")}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    disabled={busy || phase === "recording"}
                                    onClick={() => void newRound(world)}
                                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    {t("nextRound")}
                                </button>
                            </div>

                            {/* 提示 */}
                            <div className="mt-5 flex flex-wrap items-center gap-2">
                                <span className="text-xs uppercase tracking-wider text-gray-400 mr-1">{t("hintsLabel")}</span>
                                {OFFERED_HINTS.map((hint) => {
                                    const spent = ledger.used.includes(hint);
                                    return (
                                        <button
                                            key={hint}
                                            type="button"
                                            disabled={busy || phase === "recording" || spent}
                                            onClick={() => void applyHint(hint)}
                                            className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-600 hover:border-amber-300 hover:bg-amber-50 transition-colors disabled:opacity-40"
                                        >
                                            {t(`hints.${hint}`)}
                                            <span className="ml-1.5 text-gray-400">−{Math.round(HINT_CATALOG[hint].penalty * 100)}%</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {error && <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
                            {!micReady && !error && phase !== "recording" && (
                                <p className="mt-4 text-xs text-gray-400">{t("micNotice")}</p>
                            )}

                            {/* ══════════ 结果 ══════════ */}
                            {score && track && (
                                <div className="mt-8 border-t border-gray-100 pt-7">
                                    <div className="flex items-center gap-1.5">
                                        {[1, 2, 3].map((n) => (
                                            <Star
                                                key={n}
                                                className={`h-7 w-7 ${n <= score.stars ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                                            />
                                        ))}
                                        <span className="ml-3 text-2xl font-semibold text-gray-900">{Math.round(score.total * 100)}</span>
                                        {score.total !== score.rawTotal && (
                                            <span className="ml-1 text-sm text-gray-400 line-through">{Math.round(score.rawTotal * 100)}</span>
                                        )}
                                    </div>

                                    <div className="mt-5 grid grid-cols-3 gap-4">
                                        {[
                                            { label: t("axis.sequence"), value: score.sequence },
                                            { label: t("axis.intonation"), value: score.intonation },
                                            { label: t("axis.rhythm"), value: score.rhythm },
                                        ].map((axis) => (
                                            <div key={axis.label}>
                                                <div className="flex items-baseline justify-between">
                                                    <span className="text-xs text-gray-500">{axis.label}</span>
                                                    <span className="text-sm font-medium text-gray-800">
                                                        {axis.value === null ? t("axis.na") : Math.round(axis.value * 100)}
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                                        style={{ width: `${(axis.value ?? 0) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-7 rounded-2xl bg-gray-50/80 p-4">
                                        <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">{t("curveLabel")}</div>
                                        <PitchCurve track={track} lick={lick} />
                                    </div>

                                    <div className="mt-6 space-y-2.5">
                                        {noteRows.map((note) => (
                                            <div key={note.targetIndex} className="flex items-center gap-3">
                                                <span className="w-14 shrink-0 text-sm font-medium text-gray-700">{noteName(note.targetMidi)}</span>
                                                <span className="w-20 shrink-0 text-xs text-gray-400">
                                                    {note.fingering ? t(`fingering.${note.fingering.finger}`, { string: ["G", "D", "A", "E"][note.fingering.stringIndex]! }) : ""}
                                                </span>
                                                <div className="flex-1">
                                                    {note.centsError === null ? (
                                                        <div className="h-2.5 rounded-full bg-gray-100" />
                                                    ) : (
                                                        <CentsBar cents={note.centsError} tolerance={score.toleranceCents} />
                                                    )}
                                                </div>
                                                <span
                                                    className={`w-16 shrink-0 text-right text-xs tabular-nums ${
                                                        note.centsError === null ? "text-gray-300" : note.inTune ? "text-emerald-600" : "text-rose-600"
                                                    }`}
                                                >
                                                    {note.centsError === null
                                                        ? t(`op.${note.op}`)
                                                        : `${note.centsError > 0 ? "+" : ""}${Math.round(note.centsError)}¢`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <ul className="mt-7 space-y-2">
                                        {score.feedback.map((item, index) => (
                                            <li key={index} className="text-sm text-gray-600 leading-relaxed">
                                                {renderFeedback(item, t)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Turns a `Feedback` value into a sentence.
 *
 * The lists are joined here rather than in the engine because the separator is
 * locale-specific — Chinese uses 、 where English uses a comma.
 */
function renderFeedback(item: Feedback, t: ReturnType<typeof useTranslations<"quest">>): string {
    const join = (parts: string[], truncated: boolean) => parts.join(t("feedback.separator")) + (truncated ? t("feedback.ellipsis") : "");

    switch (item.code) {
        case "noNotes":
            return t("feedback.noNotes");
        case "missedNotes":
            return t("feedback.missedNotes", { count: item.count });
        case "wrongNotes":
            return t("feedback.wrongNotes", {
                items: join(
                    item.notes.map((n) => t("feedback.wrongNoteItem", { index: n.index, expected: n.expected })),
                    item.truncated,
                ),
            });
        case "badlyTuned":
            return t("feedback.badlyTuned", {
                items: join(
                    item.notes.map((n) => t("feedback.badlyTunedItem", { expected: n.expected, cents: `${n.cents > 0 ? "+" : ""}${n.cents}` })),
                    item.truncated,
                ),
            });
        case "extraNotes":
            return t("feedback.extraNotes", { count: item.count });
        case "openStringDetuned":
            return t("feedback.openStringDetuned", {
                strings: item.strings.map((s) => t("feedback.stringName", { name: s })).join(t("feedback.separator")),
            });
        case "systematicOffset":
            return t(item.sharp ? "feedback.systematicSharp" : "feedback.systematicFlat", { cents: item.cents });
        case "worstNote":
            return item.fingering
                ? t("feedback.worstNoteWithFingering", {
                      note: item.note,
                      fingering: item.fingering,
                      cents: `${item.cents > 0 ? "+" : ""}${item.cents}`,
                  })
                : t("feedback.worstNote", { note: item.note, cents: `${item.cents > 0 ? "+" : ""}${item.cents}` });
        case "rhythmUnsteady":
            return t("feedback.rhythmUnsteady");
        case "clean":
            return t("feedback.clean");
    }
}
