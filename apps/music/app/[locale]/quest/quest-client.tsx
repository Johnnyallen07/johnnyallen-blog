"use client";

/**
 * 视唱练耳 (Foundation Mode) & 扒谱闯关 (Advanced Quest Mode).
 *
 * All musical decisions (pitch tracking, segmentation, octave-invariant
 * alignment, Sing-It-Home resolution paths, ghost stepping-stones, and
 * three-axis scoring) live in `lib/quest/`. This component owns the UI state
 * machine, the SVG five-line staff renderer, and Web Audio handoff.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
    ArrowRight,
    ChevronLeft,
    Flame,
    Loader2,
    Mic,
    Music2,
    Play,
    RotateCcw,
    Sparkles,
    Square,
    Star,
    Volume2,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { createQuestAudioContext, openQuestRecorder, playSamples, type QuestRecorder } from "@/lib/quest-audio";
import {
    createStaffGlyph,
    type FoundationRound,
    type FoundationStageId,
    generateFoundationRound,
    generateMasteryLoop,
    type HomeRung,
    keySignatureSharps,
    scoreFoundationAttempt,
    type StaffNoteGlyph,
} from "@/lib/quest/foundation";
import { generateLick } from "@/lib/quest/licks";
import { createInputPitchDetector } from "@/lib/quest/pitchtrack";
import { segmentNotes } from "@/lib/quest/segment";
import { DEFAULT_SYNTH_CONFIG, renderFoundationPrompt, renderLick } from "@/lib/quest/synth";
import { createHintLedger, FREE_REPLAYS, HINT_CATALOG, takeHint } from "@/lib/quest/hints";
import { scoreAttempt } from "@/lib/quest/scoring";
import { noteName } from "@/lib/quest/theory";
import type { Feedback, HintLedger, HintType, Lick, NoteScore, PitchTrack, Score, Tolerance } from "@/lib/quest/types";

type TopMode = "foundation" | "quest";
type AnswerStyle = "voice" | "violin" | "singThenPlay";
type Phase = "idle" | "prompt" | "ready" | "recording" | "grading" | "result";

const FOUNDATION_STAGES: FoundationStageId[] = ["echo", "sight", "home", "fill"];
const HOME_RUNGS: HomeRung[] = [1, 2, 3, 4, 5, 6];
const WORLD_IDS = [1, 2, 3, 4, 5, 6];
const OFFERED_HINTS: HintType[] = ["slow_75", "slow_50", "reveal_key", "reveal_first_note"];
const TOLERANCES: Tolerance[] = [35, 25, 15, 8];

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
 * Conservatory-style SVG Five-Line Treble Staff (`𝄞`) with Movable-Do badges,
 * Ghost Stepping-Stones (`2̂-3̂-4̂`), Mystery `?` blocks, and post-attempt Cents readout.
 */
function TrebleStaffSvg({
    glyphs,
    tonicMidi,
    mode,
    showSolfege,
    showSteppingStones,
    noteScores,
}: {
    glyphs: readonly StaffNoteGlyph[];
    tonicMidi: number;
    mode: Lick["mode"];
    showSolfege: boolean;
    showSteppingStones: boolean;
    noteScores?: readonly NoteScore[];
}) {
    const visibleGlyphs = useMemo(
        () => glyphs.filter(g => showSteppingStones || !g.isSteppingStone),
        [glyphs, showSteppingStones],
    );

    const sharps = useMemo(() => keySignatureSharps(tonicMidi, mode), [tonicMidi, mode]);
    const scoreByTarget = useMemo(() => {
        const map = new Map<number, NoteScore>();
        if (noteScores) {
            for (const ns of noteScores) map.set(ns.targetIndex, ns);
        }
        return map;
    }, [noteScores]);

    // Staff vertical geometry:
    // Bottom line E4 (step 0) = y 126; step spacing = 7px (line-to-line = 14px).
    // Top line F5 (step 8) = y 70.
    const bottomLineY = 126;
    const stepPx = 7;
    const stepToY = (step: number) => bottomLineY - step * stepPx;

    const width = Math.max(680, 170 + visibleGlyphs.length * 82);
    const staffLeft = 24;
    const staffRight = width - 24;
    const noteStartX = 135 + sharps.length * 14;
    const noteSpacing = visibleGlyphs.length > 1
        ? Math.min(88, (staffRight - noteStartX - 45) / visibleGlyphs.length)
        : 90;

    // Treble clef sharp staff steps: F5(8), C5(5), G5(9), D5(6)
    const sharpSteps = [8, 5, 9, 6];

    return (
        <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${width} 190`} className="w-full min-w-[560px] h-[190px]">
                {/* 5 Staff Lines: steps 0 (E4), 2 (G4), 4 (B4), 6 (D5), 8 (F5) */}
                {[0, 2, 4, 6, 8].map(step => (
                    <line
                        key={step}
                        x1={staffLeft}
                        x2={staffRight}
                        y1={stepToY(step)}
                        y2={stepToY(step)}
                        stroke="#cbd5e1"
                        strokeWidth={1.35}
                    />
                ))}

                {/* Left & Right Barlines */}
                <line x1={staffLeft} x2={staffLeft} y1={stepToY(8)} y2={stepToY(0)} stroke="#64748b" strokeWidth={2} />
                <line x1={staffRight - 5} x2={staffRight - 5} y1={stepToY(8)} y2={stepToY(0)} stroke="#64748b" strokeWidth={1.2} />
                <line x1={staffRight} x2={staffRight} y1={stepToY(8)} y2={stepToY(0)} stroke="#334155" strokeWidth={3} />

                {/* Treble Clef 𝄞 */}
                <text x={staffLeft + 10} y={stepToY(1) + 12} fontSize={54} fill="#1e293b" className="select-none font-serif">
                    𝄞
                </text>

                {/* Key Signature Sharps */}
                {sharps.map((_, idx) => {
                    const st = sharpSteps[idx] ?? 8;
                    return (
                        <text
                            key={idx}
                            x={staffLeft + 54 + idx * 13}
                            y={stepToY(st) + 5}
                            fontSize={16}
                            fontWeight={600}
                            fill="#334155"
                        >
                            ♯
                        </text>
                    );
                })}

                {/* Time Signature 4/4 */}
                <text x={staffLeft + 62 + sharps.length * 13} y={stepToY(6) + 5} fontSize={18} fontWeight={700} fill="#475569">
                    4
                </text>
                <text x={staffLeft + 62 + sharps.length * 13} y={stepToY(2) + 5} fontSize={18} fontWeight={700} fill="#475569">
                    4
                </text>

                {/* Notes */}
                {visibleGlyphs.map((glyph, index) => {
                    const cx = noteStartX + index * noteSpacing;
                    const cy = stepToY(glyph.staffStep);
                    const ns = glyph.targetIndex >= 0 ? scoreByTarget.get(glyph.targetIndex) : undefined;

                    if (glyph.visibility === "hidden") {
                        return (
                            <g key={index}>
                                <rect
                                    x={cx - 18}
                                    y={stepToY(6) - 6}
                                    width={36}
                                    height={48}
                                    rx={10}
                                    fill="#fef3c7"
                                    stroke="#f59e0b"
                                    strokeWidth={1.8}
                                    strokeDasharray="4 3"
                                />
                                <text
                                    x={cx}
                                    y={stepToY(4) + 6}
                                    textAnchor="middle"
                                    fontSize={20}
                                    fontWeight={700}
                                    fill="#d97706"
                                >
                                    ?
                                </text>
                                <text
                                    x={cx}
                                    y={stepToY(8) - 12}
                                    textAnchor="middle"
                                    fontSize={10.5}
                                    fontWeight={600}
                                    fill="#b45309"
                                >
                                    #{glyph.targetIndex + 1}
                                </text>
                            </g>
                        );
                    }

                    const isGhost = glyph.visibility === "ghost";
                    const isMatched = ns?.op === "match";
                    const inTune = ns?.inTune ?? false;

                    const fillColor = isGhost
                        ? "#e0e7ff"
                        : ns
                            ? inTune
                                ? "#059669"
                                : isMatched
                                    ? "#d97706"
                                    : "#e11d48"
                            : glyph.targetIndex === -1
                                ? "#0d9488"
                                : "#1e293b";

                    const strokeColor = isGhost ? "#6366f1" : fillColor;
                    const stemUp = glyph.staffStep < 4;

                    // Ledger lines below E4 (steps <= -2) or above F5 (steps >= 10)
                    const ledgerSteps: number[] = [];
                    for (let s = -2; s >= glyph.staffStep; s -= 2) ledgerSteps.push(s);
                    for (let s = 10; s <= glyph.staffStep; s += 2) ledgerSteps.push(s);

                    return (
                        <g key={index} opacity={isGhost ? 0.68 : 1}>
                            {/* Ledger lines */}
                            {ledgerSteps.map(ls => (
                                <line
                                    key={ls}
                                    x1={cx - 13}
                                    x2={cx + 13}
                                    y1={stepToY(ls)}
                                    y2={stepToY(ls)}
                                    stroke="#64748b"
                                    strokeWidth={1.4}
                                />
                            ))}

                            {/* Solfège / Scale Degree Pill above staff */}
                            {showSolfege && (
                                <g>
                                    <rect
                                        x={cx - 22}
                                        y={14}
                                        width={44}
                                        height={20}
                                        rx={6}
                                        fill={isGhost ? "#eef2ff" : "#ecfdf5"}
                                        stroke={isGhost ? "#a5b4fc" : "#6ee7b7"}
                                        strokeWidth={1}
                                    />
                                    <text
                                        x={cx}
                                        y={28}
                                        textAnchor="middle"
                                        fontSize={10.5}
                                        fontWeight={600}
                                        fill={isGhost ? "#4f46e5" : "#047857"}
                                    >
                                        {glyph.degreeCaret} {glyph.solfege}
                                    </text>
                                </g>
                            )}

                            {/* Stem */}
                            {!isGhost && (
                                <line
                                    x1={stemUp ? cx + 7 : cx - 7}
                                    x2={stemUp ? cx + 7 : cx - 7}
                                    y1={cy}
                                    y2={stemUp ? cy - 36 : cy + 36}
                                    stroke={strokeColor}
                                    strokeWidth={1.8}
                                />
                            )}

                            {/* Notehead */}
                            <ellipse
                                cx={cx}
                                cy={cy}
                                rx={8.2}
                                ry={5.8}
                                transform={`rotate(-18 ${cx} ${cy})`}
                                fill={glyph.beats >= 1.5 && !isGhost ? "#ffffff" : fillColor}
                                stroke={strokeColor}
                                strokeWidth={isGhost ? 1.6 : 2.0}
                                strokeDasharray={isGhost ? "3 2" : undefined}
                            />

                            {/* Note name & Cents readout below staff */}
                            <text
                                x={cx}
                                y={160}
                                textAnchor="middle"
                                fontSize={11}
                                fontWeight={600}
                                fill={isGhost ? "#6366f1" : "#334155"}
                            >
                                {glyph.name}
                            </text>
                            {ns && ns.centsError !== null && (
                                <text
                                    x={cx}
                                    y={176}
                                    textAnchor="middle"
                                    fontSize={10.5}
                                    fontWeight={600}
                                    fill={ns.inTune ? "#059669" : "#e11d48"}
                                >
                                    {ns.centsError > 0 ? "+" : ""}
                                    {Math.round(ns.centsError)}¢
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

/**
 * Draws the detected pitch against the target, folding octave offsets so human
 * voice (e.g. baritone D3..A3) overlays directly onto the violin target register (D4..A4).
 */
function PitchCurve({ track, lick, height = 170 }: { track: PitchTrack; lick: Lick; height?: number }) {
    let loMidi = Infinity;
    let hiMidi = -Infinity;

    const targetSum = lick.notes.reduce((acc, n) => acc + n.midi, 0);
    const targetCenter = lick.notes.length > 0 ? targetSum / lick.notes.length : 62;

    for (const note of lick.notes) {
        loMidi = Math.min(loMidi, note.midi);
        hiMidi = Math.max(hiMidi, note.midi);
    }

    const foldToTargetRegister = (rawMidi: number) => {
        const octaveShift = 12 * Math.round((targetCenter - rawMidi) / 12);
        return rawMidi + octaveShift;
    };

    for (let i = 0; i < track.times.length; i++) {
        if (!track.voiced[i] || track.f0Hz[i]! <= 0) continue;
        const rawMidi = 69 + 12 * Math.log2(track.f0Hz[i]! / 440);
        const midi = foldToTargetRegister(rawMidi);
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
            const rawMidi = 69 + 12 * Math.log2(track.f0Hz[i]! / 440);
            const midi = foldToTargetRegister(rawMidi);
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
    const searchParams = useSearchParams();

    // Top-level mode: "foundation" (视唱练耳基础) vs "quest" (扒谱闯关进阶)
    const [topMode, setTopMode] = useState<TopMode>("foundation");
    const [foundationStage, setFoundationStage] = useState<FoundationStageId>("echo");
    const [homeRung, setHomeRung] = useState<HomeRung>(2);
    const [loopActive, setLoopActive] = useState(false);
    const [loopRounds, setLoopRounds] = useState<readonly FoundationRound[]>([]);
    const [loopIndex, setLoopIndex] = useState(0);

    // Input & notation toggles
    const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("voice");
    const [singLocked, setSingLocked] = useState(false);
    const [showSolfege, setShowSolfege] = useState(true);
    const [showSteppingStones, setShowSteppingStones] = useState(true);
    const [withDrone, setWithDrone] = useState(true);

    // Advanced Quest mode state
    const [world, setWorld] = useState(1);
    const [tolerance, setTolerance] = useState<Tolerance>(35);
    const [phase, setPhase] = useState<Phase>("idle");
    const [lick, setLick] = useState<Lick | null>(null);
    const [foundationRound, setFoundationRound] = useState<FoundationRound | null>(null);
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

    // Sync topMode from URL query parameter (?mode=foundation or ?mode=quest)
    useEffect(() => {
        const paramMode = searchParams.get("mode");
        if (paramMode === "quest") {
            setTopMode("quest");
            setAnswerStyle("singThenPlay");
            setTolerance(25);
        } else if (paramMode === "foundation") {
            setTopMode("foundation");
            setAnswerStyle("voice");
            setTolerance(35);
        }
    }, [searchParams]);

    useEffect(() => {
        setProgress(loadProgress());
        setInsecure(!window.isSecureContext);
    }, []);

    const persist = useCallback((next: StoredProgress) => {
        setProgress(next);
        try {
            window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
        } catch {
            // Private browsing denies localStorage
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

    const playAudioBuffer = useCallback(
        async (samples: Float32Array) => {
            const context = ensureContext();
            await context.resume();
            setPhase("prompt");
            playbackRef.current?.stop();
            const handle = playSamples(context, samples);
            playbackRef.current = handle;
            await handle.done;
            playbackRef.current = null;
            setPhase("ready");
        },
        [ensureContext],
    );

    const renderCurrentPrompt = useCallback(
        (targetLick: Lick, fRound: FoundationRound | null, tempoScale = 1) => {
            const context = ensureContext();
            const cfg = { ...DEFAULT_SYNTH_CONFIG, sr: context.sampleRate };
            if (fRound) {
                return renderFoundationPrompt(
                    {
                        tonicMidi: fRound.tonicMidi,
                        cueMidi: fRound.cueMidi,
                        targetLick: fRound.targetLick,
                        promptAudioMode: fRound.promptAudioMode,
                        tempoScale,
                        withDrone: withDrone && (fRound.stage === "echo" || fRound.stage === "sight"),
                    },
                    cfg,
                );
            }
            return renderLick(targetLick, cfg, { tempoScale });
        },
        [ensureContext, withDrone],
    );

    const startFoundationRound = useCallback(
        async (stageOverride?: FoundationStageId, rungOverride?: HomeRung, explicitRound?: FoundationRound) => {
            setError("");
            setScore(null);
            setTrack(null);
            setSingLocked(false);
            setRevealed({ key: false, firstNote: false });
            setLedger(createHintLedger());
            renderedRef.current = null;

            const nextRound =
                explicitRound ??
                generateFoundationRound({
                    stage: stageOverride ?? foundationStage,
                    rung: rungOverride ?? homeRung,
                    seed: Math.floor(Math.random() * 2 ** 31),
                });

            setFoundationRound(nextRound);
            setLick(nextRound.targetLick);
            const samples = renderCurrentPrompt(nextRound.targetLick, nextRound, 1);
            renderedRef.current = samples;
            await playAudioBuffer(samples);
        },
        [foundationStage, homeRung, playAudioBuffer, renderCurrentPrompt],
    );

    const startMasteryLoop = useCallback(async () => {
        const seed = Math.floor(Math.random() * 2 ** 31);
        const rounds = generateMasteryLoop(seed, homeRung);
        setLoopRounds(rounds);
        setLoopIndex(0);
        setFoundationStage(rounds[0]!.stage);
        await startFoundationRound(rounds[0]!.stage, homeRung, rounds[0]!);
    }, [homeRung, startFoundationRound]);

    const advanceMasteryLoop = useCallback(async () => {
        const nextIdx = loopIndex + 1;
        if (nextIdx < loopRounds.length) {
            const nextRound = loopRounds[nextIdx]!;
            setLoopIndex(nextIdx);
            setFoundationStage(nextRound.stage);
            await startFoundationRound(nextRound.stage, homeRung, nextRound);
        } else {
            await startMasteryLoop();
        }
    }, [homeRung, loopIndex, loopRounds, startFoundationRound, startMasteryLoop]);

    const startQuestRound = useCallback(
        async (targetWorld: number) => {
            setError("");
            setScore(null);
            setTrack(null);
            setSingLocked(false);
            setFoundationRound(null);
            setRevealed({ key: false, firstNote: false });
            setLedger(createHintLedger());
            renderedRef.current = null;

            const next = generateLick({ world: targetWorld, seed: Math.floor(Math.random() * 2 ** 31) });
            setLick(next);
            const samples = renderCurrentPrompt(next, null, 1);
            renderedRef.current = samples;
            await playAudioBuffer(samples);
        },
        [playAudioBuffer, renderCurrentPrompt],
    );

    const replay = useCallback(
        async (tempoScale = 1) => {
            if (!lick) return;
            if (tempoScale === 1 && topMode === "quest") {
                setLedger((prev) => {
                    const copy: HintLedger = { used: [...prev.used], freeReplaysRemaining: prev.freeReplaysRemaining };
                    takeHint(copy, "replay");
                    return copy;
                });
            }
            const samples =
                tempoScale === 1 && renderedRef.current
                    ? renderedRef.current
                    : renderCurrentPrompt(lick, foundationRound, tempoScale);
            if (tempoScale === 1) renderedRef.current = samples;
            await playAudioBuffer(samples);
        },
        [foundationRound, lick, playAudioBuffer, renderCurrentPrompt, topMode],
    );

    const playFullReferenceMelody = useCallback(async () => {
        if (!lick) return;
        const context = ensureContext();
        const samples = renderLick(lick, { ...DEFAULT_SYNTH_CONFIG, sr: context.sampleRate });
        await playAudioBuffer(samples);
    }, [ensureContext, lick, playAudioBuffer]);

    const applyHint = useCallback(
        async (hint: HintType) => {
            if (!lick) return;
            setLedger((prev) => {
                const copy: HintLedger = { used: [...prev.used], freeReplaysRemaining: prev.freeReplaysRemaining };
                takeHint(copy, hint);
                return copy;
            });
            if (hint === "slow_75") await replay(1 / 0.75);
            else if (hint === "slow_50") await replay(2);
            else if (hint === "reveal_key") setRevealed((prev) => ({ ...prev, key: true }));
            else if (hint === "reveal_first_note") setRevealed((prev) => ({ ...prev, firstNote: true }));
        },
        [lick, replay],
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

        await new Promise((resolve) => window.setTimeout(resolve, 0));

        try {
            const profile =
                answerStyle === "voice" || (answerStyle === "singThenPlay" && !singLocked)
                    ? "voice"
                    : answerStyle === "violin"
                        ? "violin"
                        : "auto";

            const detect = createInputPitchDetector(profile);
            const pitchTrack = detect(samples, recorder.sampleRate);
            const events = segmentNotes(pitchTrack);

            let result: Score;
            let matchedLick = lick;

            if (topMode === "foundation" && foundationRound) {
                const graded = scoreFoundationAttempt(foundationRound, events, {
                    tolerance,
                    ledger,
                    octaveInvariant: true,
                });
                result = graded.score;
                matchedLick = graded.matchedLick;
                setLick(matchedLick);
            } else {
                const activeTolerance: Tolerance =
                    answerStyle === "singThenPlay" && !singLocked ? 35 : tolerance;
                result = scoreAttempt(lick, events, {
                    tolerance: activeTolerance,
                    ledger,
                    octaveInvariant: true,
                });
            }

            setTrack(pitchTrack);
            setScore(result);

            // Sing-Then-Play Phase 1 -> Phase 2 transition
            if (answerStyle === "singThenPlay" && !singLocked && result.sequence >= 0.75) {
                setSingLocked(true);
                setPhase("ready");
                return;
            }

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
    }, [answerStyle, foundationRound, ledger, lick, persist, progress, singLocked, t, tolerance, topMode]);

    const replaysLeft = ledger.freeReplaysRemaining;
    const busy = phase === "prompt" || phase === "grading";

    // Build staff glyphs to display for the current round & phase
    const displayedStaffGlyphs = useMemo<readonly StaffNoteGlyph[]>(() => {
        if (!lick) return [];
        if (topMode === "foundation" && foundationRound) {
            return phase === "result" ? foundationRound.revealedGlyphs : foundationRound.staffGlyphs;
        }
        // In Advanced Quest Mode:
        // - Phase 1 (blind): hidden `?` notes (except first note if revealed)
        // - Phase 2 (after Sing-Then-Play vocal lock-in): ghost scale-degree contour
        // - Result phase: full revealed notation
        return lick.notes.map((n, i) => {
            const visibility =
                phase === "result"
                    ? "full"
                    : singLocked
                        ? "ghost"
                        : i === 0 && revealed.firstNote
                            ? "full"
                            : "hidden";
            return createStaffGlyph(n.midi, n.beats, lick.tonicMidi, lick.mode, i, visibility, false);
        });
    }, [foundationRound, lick, phase, revealed.firstNote, singLocked, topMode]);

    const noteRows = useMemo(() => {
        if (!score) return [];
        return score.noteScores;
    }, [score]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-teal-50/50 via-white to-white">
            <div className="mx-auto max-w-4xl px-4 py-6 md:py-10">
                <div className="flex items-center justify-between gap-3 mb-6">
                    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-700 transition-colors">
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

                {/* ══════════ 顶层双模式切换：基础视唱练耳 vs 进阶扒谱闯关 ══════════ */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                        type="button"
                        disabled={busy || phase === "recording"}
                        onClick={() => {
                            setTopMode("foundation");
                            setAnswerStyle("voice");
                            setTolerance(35);
                            setPhase("idle");
                            setLick(null);
                            setFoundationRound(null);
                            setScore(null);
                            setTrack(null);
                        }}
                        className={`text-left rounded-2xl border p-4 transition-all duration-200 ${
                            topMode === "foundation"
                                ? "border-teal-500 bg-teal-50/80 shadow-sm ring-1 ring-teal-500/30"
                                : "border-gray-200 bg-white hover:border-teal-200 hover:bg-teal-50/30"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-base font-semibold text-gray-900">{t("modeFoundation")}</span>
                            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                                Stage 0.1 – 0.4
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-600 leading-relaxed">{t("modeFoundationSub")}</p>
                    </button>

                    <button
                        type="button"
                        disabled={busy || phase === "recording"}
                        onClick={() => {
                            setTopMode("quest");
                            setAnswerStyle("singThenPlay");
                            setTolerance(25);
                            setPhase("idle");
                            setLick(null);
                            setFoundationRound(null);
                            setScore(null);
                            setTrack(null);
                        }}
                        className={`text-left rounded-2xl border p-4 transition-all duration-200 ${
                            topMode === "quest"
                                ? "border-amber-500 bg-amber-50/80 shadow-sm ring-1 ring-amber-500/30"
                                : "border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/30"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-base font-semibold text-gray-900">{t("modeQuest")}</span>
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                World 1 – 6
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-600 leading-relaxed">{t("modeQuestSub")}</p>
                    </button>
                </div>

                {/* ══════════ 基础模式：视唱练耳四阶选择 + 四幕渐进特训 ══════════ */}
                {topMode === "foundation" ? (
                    <div className="mt-6">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                            <span className="text-xs uppercase tracking-wider text-gray-400">{t("foundationStageLabel")}</span>
                            <button
                                type="button"
                                disabled={busy || phase === "recording"}
                                onClick={() => {
                                    const nextLoop = !loopActive;
                                    setLoopActive(nextLoop);
                                    if (nextLoop) {
                                        void startMasteryLoop();
                                    }
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all ${
                                    loopActive
                                        ? "bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm"
                                        : "border border-teal-200 bg-teal-50/70 text-teal-800 hover:bg-teal-100"
                                }`}
                            >
                                <Flame className="h-3.5 w-3.5" />
                                {t("loopToggle")}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {FOUNDATION_STAGES.map((stg) => (
                                <button
                                    key={stg}
                                    type="button"
                                    disabled={busy || phase === "recording"}
                                    onClick={() => {
                                        setLoopActive(false);
                                        setFoundationStage(stg);
                                        void startFoundationRound(stg, homeRung);
                                    }}
                                    className={`text-left rounded-2xl border px-4 py-3 transition-all duration-200 disabled:opacity-50 ${
                                        foundationStage === stg
                                            ? "border-teal-400 bg-teal-50/80 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-teal-200 hover:bg-teal-50/30"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-gray-800">
                                            {t(`foundationStages.${stg}.name`)}
                                        </span>
                                        <span className="rounded-full bg-white/90 border border-teal-200 px-2 py-0.5 text-[11px] text-teal-700">
                                            {t(`foundationStages.${stg}.badge`)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                                        {t(`foundationStages.${stg}.blurb`)}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* 单音归家 (0.3) 音级解锁阶梯 */}
                        {foundationStage === "home" && (
                            <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/40 p-3.5">
                                <div className="text-xs font-medium text-teal-800 mb-2">{t("rungLabel")}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {HOME_RUNGS.map((r) => (
                                        <button
                                            key={r}
                                            type="button"
                                            disabled={busy || phase === "recording"}
                                            onClick={() => {
                                                setHomeRung(r);
                                                void startFoundationRound("home", r);
                                            }}
                                            className={`rounded-full px-3 py-1 text-xs transition-all ${
                                                homeRung === r
                                                    ? "bg-teal-700 text-white font-medium shadow-xs"
                                                    : "bg-white text-gray-700 border border-gray-200 hover:border-teal-300"
                                            }`}
                                        >
                                            {t(`rungs.${r}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ══════════ 进阶模式：World 1–6 关卡选择 ══════════ */
                    <div className="mt-6">
                        <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">{t("worldLabel")}</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {WORLD_IDS.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    disabled={busy || phase === "recording"}
                                    onClick={() => {
                                        setWorld(id);
                                        void startQuestRound(id);
                                    }}
                                    className={`text-left rounded-2xl border px-3.5 py-3 transition-all duration-200 disabled:opacity-50 ${
                                        world === id
                                            ? "border-amber-400 bg-amber-50/80 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/40"
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
                )}

                {/* ══════════ 作答方式 (🎤人声 / 🎻小提琴 / 🎤→🎻先唱后拉) & 音准容差 ══════════ */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs uppercase tracking-wider text-gray-400 mr-1">{t("inputLabel")}</span>
                        {(["voice", "violin", "singThenPlay"] as AnswerStyle[]).map((style) => (
                            <button
                                key={style}
                                type="button"
                                onClick={() => {
                                    setAnswerStyle(style);
                                    setSingLocked(false);
                                    if (style === "voice") setTolerance(35);
                                    else if (tolerance === 35) setTolerance(25);
                                }}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                    answerStyle === style
                                        ? "bg-teal-700 text-white"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                {t(`input.${style}`)}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs uppercase tracking-wider text-gray-400 mr-1">{t("toleranceLabel")}</span>
                        {TOLERANCES.map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setTolerance(value)}
                                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                                    tolerance === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                {t(`tolerance.${value}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ══════════ 主训练与五线谱面板 ══════════ */}
                <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 md:p-7 shadow-sm">
                    {!lick ? (
                        <div className="py-10 text-center">
                            <p className="text-sm text-gray-500 mb-5">
                                {t("startHint", {
                                    world:
                                        topMode === "foundation"
                                            ? t(`foundationStages.${foundationStage}.name`)
                                            : t(`worlds.${world}.name`),
                                })}
                            </p>
                            <button
                                type="button"
                                onClick={() =>
                                    void (topMode === "foundation"
                                        ? loopActive
                                            ? startMasteryLoop()
                                            : startFoundationRound()
                                        : startQuestRound(world))
                                }
                                className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-6 py-3 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
                            >
                                <Play className="h-4 w-4" />
                                {t("start")}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* 顶部元信息与四幕特训进度条 */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                                    {loopActive && foundationRound?.loopStep && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                            <Flame className="h-3.5 w-3.5" />
                                            {t("loopStepBanner", { step: foundationRound.loopStep })}
                                        </span>
                                    )}
                                    <span>
                                        {t("roundMeta", {
                                            notes: lick.notes.length,
                                            bpm: Math.round(lick.tempoBpm),
                                            tonic: noteName(lick.tonicMidi),
                                        })}
                                    </span>
                                    {revealed.key && (
                                        <span className="text-teal-700 font-medium">
                                            {t("revealedKey", { key: noteName(lick.tonicMidi) })}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs font-medium text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                                    {t("phase." + phase)}
                                </div>
                            </div>

                            {/* 单音归家 (0.3) 引导说明 */}
                            {topMode === "foundation" && foundationStage === "home" && (
                                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900 leading-relaxed">
                                    {t("homeInstruction")}
                                    {phase === "result" && foundationRound && (
                                        <div className="mt-1 font-semibold text-teal-800">
                                            {t("revealedFormulaLabel")} {foundationRound.resolutionFormula}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 先唱后拉 (Sing-Then-Play) 状态引导 */}
                            {answerStyle === "singThenPlay" && (
                                <div
                                    className={`mt-4 rounded-2xl border px-4 py-2.5 text-xs font-medium ${
                                        singLocked
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                            : "border-indigo-200 bg-indigo-50/70 text-indigo-800"
                                    }`}
                                >
                                    {singLocked ? t("singLockSuccess") : t("singLockPrompt")}
                                </div>
                            )}

                            {/* ══════════ 五线谱视图 (TrebleStaffSvg) ══════════ */}
                            <div className="mt-5 rounded-2xl border border-gray-100 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                        <Music2 className="h-3.5 w-3.5 text-teal-600" />
                                        {t("staffTitle")}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowSolfege(s => !s)}
                                            className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
                                                showSolfege
                                                    ? "bg-teal-600 text-white"
                                                    : "bg-white text-gray-500 border border-gray-200"
                                            }`}
                                        >
                                            {t("showSolfege")}
                                        </button>
                                        {topMode === "foundation" && foundationStage === "sight" && (
                                            <button
                                                type="button"
                                                onClick={() => setShowSteppingStones(s => !s)}
                                                className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
                                                    showSteppingStones
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-white text-gray-500 border border-gray-200"
                                                }`}
                                            >
                                                {t("showSteppingStones")}
                                            </button>
                                        )}
                                        {topMode === "foundation" && (foundationStage === "echo" || foundationStage === "sight") && (
                                            <button
                                                type="button"
                                                onClick={() => setWithDrone(d => !d)}
                                                className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
                                                    withDrone
                                                        ? "bg-amber-600 text-white"
                                                        : "bg-white text-gray-500 border border-gray-200"
                                                }`}
                                            >
                                                {t("droneToggle")}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <TrebleStaffSvg
                                    glyphs={displayedStaffGlyphs}
                                    tonicMidi={lick.tonicMidi}
                                    mode={lick.mode}
                                    showSolfege={showSolfege}
                                    showSteppingStones={showSteppingStones}
                                    noteScores={phase === "result" ? score?.noteScores : undefined}
                                />
                            </div>

                            {/* ══════════ 录音与播放控制栏 ══════════ */}
                            <div className="mt-6 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    disabled={busy || phase === "recording"}
                                    onClick={() => void replay()}
                                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:border-teal-300 hover:bg-teal-50/60 transition-colors disabled:opacity-40"
                                >
                                    {phase === "prompt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                    {t("replay")}
                                    {topMode === "quest" && (
                                        <span className="text-xs text-gray-400">
                                            {t("replaysLeft", { count: replaysLeft, total: FREE_REPLAYS })}
                                        </span>
                                    )}
                                </button>

                                {topMode === "foundation" && foundationStage === "sight" && (
                                    <button
                                        type="button"
                                        disabled={busy || phase === "recording"}
                                        onClick={() => void playFullReferenceMelody()}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40"
                                    >
                                        <Volume2 className="h-4 w-4" />
                                        {t("playDemoAfterSight")}
                                    </button>
                                )}

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
                                        {phase === "grading"
                                            ? t("grading")
                                            : answerStyle === "voice" || (answerStyle === "singThenPlay" && !singLocked)
                                                ? t("recordVoice")
                                                : t("recordViolin")}
                                    </button>
                                )}

                                {loopActive && phase === "result" ? (
                                    <button
                                        type="button"
                                        onClick={() => void advanceMasteryLoop()}
                                        className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        {t("nextLoopStep", { next: ((loopIndex + 1) % 4) + 1 })}
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busy || phase === "recording"}
                                        onClick={() =>
                                            void (topMode === "foundation"
                                                ? startFoundationRound()
                                                : startQuestRound(world))
                                        }
                                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        {t("nextRound")}
                                    </button>
                                )}
                            </div>

                            {/* 进阶模式提示币 */}
                            {topMode === "quest" && (
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
                            )}

                            {error && <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
                            {!micReady && !error && phase !== "recording" && (
                                <p className="mt-4 text-xs text-gray-400">{t("micNotice")}</p>
                            )}

                            {/* ══════════ 评分结果与音高轨迹 ══════════ */}
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
                                                        className="h-full rounded-full bg-teal-500 transition-all duration-500"
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
