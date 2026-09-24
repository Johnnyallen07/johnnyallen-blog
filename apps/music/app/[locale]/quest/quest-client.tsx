"use client";

/**
 * 视唱练耳 (Foundation Mode) & 扒谱闯关 (Advanced Quest Mode).
 *
 * All musical decisions (pitch tracking, segmentation, octave-invariant
 * alignment, key ladder, vocal register, resolution paths and scoring) live in
 * `lib/quest/`. This component owns the UI state machine and Web Audio
 * handoff; the staff and the gamification chrome live beside it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronLeft, Flame, Loader2, Mic, Play, RotateCcw, Square, Star, Volume2 } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { createQuestAudioContext, openQuestRecorder, playSamples, type QuestRecorder } from "@/lib/quest-audio";
import {
    createStaffGlyph,
    type FoundationRound,
    type FoundationStageId,
    generateFoundationRound,
    generateMasteryLoop,
    type HomeRung,
    scoreFoundationAttempt,
    type StaffNoteGlyph,
} from "@/lib/quest/foundation";
import {
    applyRound,
    checkLadderComplete,
    createProgress,
    dayStamp,
    levelForXp,
    type PlayerProgress,
} from "@/lib/quest/gamification";
import { KEY_LADDER, type KeyStage, type VoiceRange } from "@/lib/quest/keys";
import { generateLick } from "@/lib/quest/licks";
import { createInputPitchDetector } from "@/lib/quest/pitchtrack";
import { segmentNotes } from "@/lib/quest/segment";
import { DEFAULT_SYNTH_CONFIG, renderFoundationPrompt, renderLick } from "@/lib/quest/synth";
import { createHintLedger, FREE_REPLAYS, HINT_CATALOG, takeHint } from "@/lib/quest/hints";
import { scoreAttempt } from "@/lib/quest/scoring";
import { noteName } from "@/lib/quest/theory";
import type { Feedback, HintLedger, HintType, Lick, PitchTrack, Score, Tolerance } from "@/lib/quest/types";

import { BadgeShelf, isKeyUnlocked, KeyLadder, ProgressHud, type RewardInfo, RewardCard } from "./quest-hud";
import { TrebleStaffSvg } from "./staff-svg";

type TopMode = "foundation" | "quest";
type AnswerStyle = "voice" | "violin" | "singThenPlay";
type Singer = "male" | "female";
type Phase = "idle" | "prompt" | "ready" | "recording" | "grading" | "result";

const FOUNDATION_STAGES: FoundationStageId[] = ["echo", "sight", "home", "fill"];
const STAGE_ICON: Record<FoundationStageId, string> = { echo: "👀", sight: "🪜", home: "🏠", fill: "🧩" };
const HOME_RUNGS: HomeRung[] = [1, 2, 3, 4, 5];
const WORLD_IDS = [1, 2, 3, 4, 5, 6];
const OFFERED_HINTS: HintType[] = ["slow_75", "slow_50", "reveal_key", "reveal_first_note"];
const TOLERANCES: Tolerance[] = [35, 25, 15, 8];

const PROGRESS_KEY = "fiddle-quest-progress-v2";
const SETTINGS_KEY = "fiddle-quest-settings-v1";

function loadProgress(): PlayerProgress {
    const fresh = createProgress();
    try {
        const raw = window.localStorage.getItem(PROGRESS_KEY);
        if (!raw) return fresh;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return fresh;
        const p = parsed as Partial<PlayerProgress>;
        const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
        const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
        return {
            xp: num(p.xp, 0),
            dayStreak: num(p.dayStreak, 0),
            bestDayStreak: num(p.bestDayStreak, 0),
            combo: num(p.combo, 0),
            bestCombo: num(p.bestCombo, 0),
            rounds: num(p.rounds, 0),
            totalStars: num(p.totalStars, 0),
            lastPlayedDay: typeof p.lastPlayedDay === "string" ? p.lastPlayedDay : null,
            keysCleared: strs(p.keysCleared),
            badges: strs(p.badges) as PlayerProgress["badges"],
            stylesUsed: strs(p.stylesUsed),
        };
    } catch {
        return fresh;
    }
}

function loadSettings(): { singer: Singer; keyId: string } {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const s = (parsed ?? {}) as { singer?: unknown; keyId?: unknown };
        return {
            singer: s.singer === "male" ? "male" : "female",
            keyId: typeof s.keyId === "string" && KEY_LADDER.some(k => k.id === s.keyId) ? s.keyId : "C",
        };
    } catch {
        return { singer: "female", keyId: "C" };
    }
}

function writeStorage(key: string, value: unknown) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Private browsing denies localStorage.
    }
}

/**
 * Draws the detected pitch against the target, folding octave offsets so a
 * voice in any register overlays the target line it was aiming for.
 */
function PitchCurve({ track, lick, height = 150 }: { track: PitchTrack; lick: Lick; height?: number }) {
    const targetCenter = lick.notes.length > 0 ? lick.notes.reduce((a, n) => a + n.midi, 0) / lick.notes.length : 62;
    const fold = (raw: number) => raw + 12 * Math.round((targetCenter - raw) / 12);

    let loMidi = Infinity;
    let hiMidi = -Infinity;
    for (const note of lick.notes) {
        loMidi = Math.min(loMidi, note.midi);
        hiMidi = Math.max(hiMidi, note.midi);
    }
    const points: (number | null)[] = [];
    for (let i = 0; i < track.times.length; i++) {
        if (!track.voiced[i] || track.f0Hz[i]! <= 0) {
            points.push(null);
            continue;
        }
        const midi = fold(69 + 12 * Math.log2(track.f0Hz[i]! / 440));
        points.push(midi);
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

    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    points.forEach((midi, i) => {
        if (midi !== null) run.push({ x: toX(track.times[i]!), y: toY(midi) });
        else if (run.length > 0) {
            runs.push(run);
            run = [];
        }
    });
    if (run.length > 0) runs.push(run);

    const targets = Array.from(new Set(lick.notes.map(n => n.midi))).sort((a, b) => a - b);
    return (
        <svg viewBox={`0 0 1000 ${height}`} className="h-[150px] w-full" preserveAspectRatio="none">
            {targets.map(midi => (
                <g key={midi}>
                    <line x1={0} x2={1000} y1={toY(midi)} y2={toY(midi)} stroke="#10b981" strokeWidth={1} strokeDasharray="6 5" opacity={0.55} />
                    <text x={6} y={toY(midi) - 4} fontSize={11} fill="#059669">
                        {noteName(midi)}
                    </text>
                </g>
            ))}
            {runs.map((segment, i) => (
                <polyline
                    key={i}
                    points={segment.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
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
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
            <div
                className={`absolute inset-y-0 rounded-full ${inTune ? "bg-emerald-500" : Math.abs(cents) > 35 ? "bg-rose-500" : "bg-amber-400"}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 1.5)}%` }}
            />
        </div>
    );
}

function Chip({
    active,
    onClick,
    disabled,
    children,
    title,
    tone = "teal",
}: {
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    title?: string;
    tone?: "teal" | "dark" | "amber" | "indigo";
}) {
    const on = {
        teal: "bg-teal-600 text-white shadow-sm",
        dark: "bg-gray-900 text-white",
        amber: "bg-amber-500 text-white",
        indigo: "bg-indigo-600 text-white",
    }[tone];
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${active ? on : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
            {children}
        </button>
    );
}

export default function QuestPageClient() {
    const t = useTranslations("quest");
    const searchParams = useSearchParams();

    const [topMode, setTopMode] = useState<TopMode>("foundation");
    const [foundationStage, setFoundationStage] = useState<FoundationStageId>("echo");
    const [homeRung, setHomeRung] = useState<HomeRung>(1);
    const [loopActive, setLoopActive] = useState(false);
    const [loopRounds, setLoopRounds] = useState<readonly FoundationRound[]>([]);
    const [loopIndex, setLoopIndex] = useState(0);

    const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("voice");
    const [singer, setSinger] = useState<Singer>("female");
    const [keyId, setKeyId] = useState("C");
    const [singLocked, setSingLocked] = useState(false);
    const [showSolfege, setShowSolfege] = useState(true);
    const [showSteppingStones, setShowSteppingStones] = useState(true);
    const [withDrone, setWithDrone] = useState(true);

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
    const [progress, setProgress] = useState<PlayerProgress>(() => createProgress());
    const [reward, setReward] = useState<RewardInfo | null>(null);
    const [insecure, setInsecure] = useState(false);

    const contextRef = useRef<AudioContext | null>(null);
    const recorderRef = useRef<QuestRecorder | null>(null);
    const renderedRef = useRef<Float32Array | null>(null);
    const playbackRef = useRef<{ stop: () => void } | null>(null);

    const selectedKey: KeyStage = useMemo(() => KEY_LADDER.find(k => k.id === keyId) ?? KEY_LADDER[0]!, [keyId]);
    /** The register the exercise is built in: the violin's, or the singer's. */
    const voiceRange: VoiceRange = answerStyle === "violin" ? "violin" : singer;

    useEffect(() => {
        const paramMode = searchParams.get("mode");
        if (paramMode === "quest") {
            setTopMode("quest");
            setAnswerStyle("singThenPlay");
            setTolerance(25);
        } else if (paramMode === "foundation") {
            setTopMode("foundation");
        }
    }, [searchParams]);

    useEffect(() => {
        const loaded = loadProgress();
        setProgress(loaded);
        const settings = loadSettings();
        setSinger(settings.singer);
        // Never restore a key the player has not unlocked (e.g. progress was cleared).
        const index = KEY_LADDER.findIndex(k => k.id === settings.keyId);
        setKeyId(isKeyUnlocked(KEY_LADDER, index, loaded.keysCleared) ? settings.keyId : "C");
        setInsecure(!window.isSecureContext);
    }, []);

    const resetRound = useCallback(() => {
        playbackRef.current?.stop();
        setPhase("idle");
        setLick(null);
        setFoundationRound(null);
        setScore(null);
        setTrack(null);
        setReward(null);
        setSingLocked(false);
        setLoopActive(false);
    }, []);

    const chooseSinger = useCallback(
        (next: Singer) => {
            setSinger(next);
            writeStorage(SETTINGS_KEY, { singer: next, keyId });
            resetRound();
        },
        [keyId, resetRound],
    );

    const chooseKey = useCallback(
        (stage: KeyStage) => {
            setKeyId(stage.id);
            writeStorage(SETTINGS_KEY, { singer, keyId: stage.id });
            resetRound();
        },
        [resetRound, singer],
    );

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
                        mode: fRound.mode,
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

    const clearAttempt = useCallback(() => {
        setError("");
        setScore(null);
        setTrack(null);
        setReward(null);
        setSingLocked(false);
        setRevealed({ key: false, firstNote: false });
        setLedger(createHintLedger());
        renderedRef.current = null;
    }, []);

    const startFoundationRound = useCallback(
        async (stageOverride?: FoundationStageId, rungOverride?: HomeRung, explicitRound?: FoundationRound) => {
            clearAttempt();
            const nextRound =
                explicitRound ??
                generateFoundationRound({
                    stage: stageOverride ?? foundationStage,
                    rung: rungOverride ?? homeRung,
                    seed: Math.floor(Math.random() * 2 ** 31),
                    key: selectedKey,
                    voice: voiceRange,
                });
            setFoundationRound(nextRound);
            setLick(nextRound.targetLick);
            const samples = renderCurrentPrompt(nextRound.targetLick, nextRound, 1);
            renderedRef.current = samples;
            await playAudioBuffer(samples);
        },
        [clearAttempt, foundationStage, homeRung, playAudioBuffer, renderCurrentPrompt, selectedKey, voiceRange],
    );

    const startMasteryLoop = useCallback(async () => {
        const rounds = generateMasteryLoop(Math.floor(Math.random() * 2 ** 31), homeRung, selectedKey, voiceRange);
        setLoopRounds(rounds);
        setLoopIndex(0);
        setFoundationStage(rounds[0]!.stage);
        await startFoundationRound(rounds[0]!.stage, homeRung, rounds[0]!);
    }, [homeRung, selectedKey, startFoundationRound, voiceRange]);

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
            clearAttempt();
            setFoundationRound(null);
            const next = generateLick({ world: targetWorld, seed: Math.floor(Math.random() * 2 ** 31) });
            setLick(next);
            const samples = renderCurrentPrompt(next, null, 1);
            renderedRef.current = samples;
            await playAudioBuffer(samples);
        },
        [clearAttempt, playAudioBuffer, renderCurrentPrompt],
    );

    const replay = useCallback(
        async (tempoScale = 1) => {
            if (!lick) return;
            if (tempoScale === 1 && topMode === "quest") {
                setLedger(prev => {
                    const copy: HintLedger = { used: [...prev.used], freeReplaysRemaining: prev.freeReplaysRemaining };
                    takeHint(copy, "replay");
                    return copy;
                });
            }
            const samples =
                tempoScale === 1 && renderedRef.current ? renderedRef.current : renderCurrentPrompt(lick, foundationRound, tempoScale);
            if (tempoScale === 1) renderedRef.current = samples;
            await playAudioBuffer(samples);
        },
        [foundationRound, lick, playAudioBuffer, renderCurrentPrompt, topMode],
    );

    const playFullReferenceMelody = useCallback(async () => {
        if (!lick) return;
        const context = ensureContext();
        await playAudioBuffer(renderLick(lick, { ...DEFAULT_SYNTH_CONFIG, sr: context.sampleRate }));
    }, [ensureContext, lick, playAudioBuffer]);

    const applyHint = useCallback(
        async (hint: HintType) => {
            if (!lick) return;
            setLedger(prev => {
                const copy: HintLedger = { used: [...prev.used], freeReplaysRemaining: prev.freeReplaysRemaining };
                takeHint(copy, hint);
                return copy;
            });
            if (hint === "slow_75") await replay(1 / 0.75);
            else if (hint === "slow_50") await replay(2);
            else if (hint === "reveal_key") setRevealed(prev => ({ ...prev, key: true }));
            else if (hint === "reveal_first_note") setRevealed(prev => ({ ...prev, firstNote: true }));
        },
        [lick, replay],
    );

    const startRecording = useCallback(async () => {
        setError("");
        try {
            const context = ensureContext();
            if (!recorderRef.current) recorderRef.current = await openQuestRecorder(context);
            recorderRef.current.start();
            setPhase("recording");
        } catch (err) {
            console.error(err);
            setError(t("errors.mic"));
            setPhase("ready");
        }
    }, [ensureContext, t]);

    const recordRound = useCallback(
        (result: Score) => {
            const style = answerStyle === "voice" ? "voice" : "violin";
            const onLadder = topMode === "foundation";
            const outcome = applyRound(progress, {
                stars: result.stars,
                toleranceCents: result.toleranceCents,
                tokensSpent: result.tokensSpent,
                day: dayStamp(new Date()),
                keyId: onLadder ? selectedKey.id : "",
                answerStyle: style,
                medianAbsCents: result.medianCentsError === null ? null : Math.abs(result.medianCentsError),
            });
            const next = checkLadderComplete(outcome.next, KEY_LADDER.length);
            const unlocked = next === outcome.next ? outcome.unlocked : [...outcome.unlocked, "ladder_complete" as const];

            let keyUnlocked: string | null = null;
            if (onLadder && !progress.keysCleared.includes(selectedKey.id) && next.keysCleared.includes(selectedKey.id)) {
                keyUnlocked = KEY_LADDER.find(k => k.index === selectedKey.index + 1)?.id ?? null;
            }

            setProgress(next);
            writeStorage(PROGRESS_KEY, next);
            setReward({
                xpGained: outcome.xpGained,
                leveledUp: outcome.leveledUp,
                level: levelForXp(next.xp).level,
                combo: next.combo,
                unlocked,
                keyUnlocked,
            });
        },
        [answerStyle, progress, selectedKey, topMode],
    );

    const stopAndGrade = useCallback(async () => {
        const recorder = recorderRef.current;
        if (!recorder || !lick) return;
        const samples = recorder.stop();
        setPhase("grading");
        await new Promise(resolve => window.setTimeout(resolve, 0));

        try {
            const singing = answerStyle === "voice" || (answerStyle === "singThenPlay" && !singLocked);
            const detect = createInputPitchDetector(singing ? "voice" : answerStyle === "violin" ? "violin" : "auto");
            const pitchTrack = detect(samples, recorder.sampleRate);
            const events = segmentNotes(pitchTrack);

            let result: Score;
            if (topMode === "foundation" && foundationRound) {
                const graded = scoreFoundationAttempt(foundationRound, events, { tolerance, ledger, octaveInvariant: true });
                result = graded.score;
                setLick(graded.matchedLick);
            } else {
                result = scoreAttempt(lick, events, {
                    tolerance: answerStyle === "singThenPlay" && !singLocked ? 35 : tolerance,
                    ledger,
                    octaveInvariant: true,
                });
            }

            setTrack(pitchTrack);
            setScore(result);

            if (answerStyle === "singThenPlay" && !singLocked && result.sequence >= 0.75) {
                setSingLocked(true);
                setPhase("ready");
                return;
            }
            setPhase("result");
            recordRound(result);
        } catch (err) {
            console.error(err);
            setError(t("errors.grading"));
            setPhase("ready");
        }
    }, [answerStyle, foundationRound, ledger, lick, recordRound, singLocked, t, tolerance, topMode]);

    const busy = phase === "prompt" || phase === "grading";
    const locked = busy || phase === "recording";

    const displayedStaffGlyphs = useMemo<readonly StaffNoteGlyph[]>(() => {
        if (!lick) return [];
        if (topMode === "foundation" && foundationRound) {
            return phase === "result" ? foundationRound.revealedGlyphs : foundationRound.staffGlyphs;
        }
        return lick.notes.map((n, i) =>
            createStaffGlyph({
                midi: n.midi,
                beats: n.beats,
                tonicMidi: lick.tonicMidi,
                mode: lick.mode,
                targetIndex: i,
                visibility:
                    phase === "result" ? "full" : singLocked ? "ghost" : i === 0 && revealed.firstNote ? "full" : "hidden",
            }),
        );
    }, [foundationRound, lick, phase, revealed.firstNote, singLocked, topMode]);

    const switchMode = (mode: TopMode) => {
        resetRound();
        setTopMode(mode);
        if (mode === "foundation") {
            if (answerStyle === "singThenPlay") setAnswerStyle("voice");
            setTolerance(answerStyle === "violin" ? 25 : 35);
        } else {
            setAnswerStyle("singThenPlay");
            setTolerance(25);
        }
    };

    const chooseStyle = (style: AnswerStyle) => {
        setAnswerStyle(style);
        setTolerance(style === "voice" ? 35 : 25);
        resetRound();
    };

    const singing = answerStyle === "voice" || (answerStyle === "singThenPlay" && !singLocked);
    const styles: AnswerStyle[] = topMode === "foundation" ? ["voice", "violin"] : ["voice", "violin", "singThenPlay"];

    return (
        <div className="min-h-screen bg-gradient-to-b from-teal-50/50 via-white to-white">
            <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
                <div className="mb-5 flex items-center justify-between gap-3">
                    <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-teal-700">
                        <ChevronLeft className="h-4 w-4" />
                        {t("back")}
                    </Link>
                    <ProgressHud progress={progress} t={t} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-gray-900">{t("title")}</h1>
                    <div className="inline-flex rounded-full bg-gray-100 p-1">
                        {(["foundation", "quest"] as TopMode[]).map(mode => (
                            <button
                                key={mode}
                                type="button"
                                disabled={locked}
                                onClick={() => switchMode(mode)}
                                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                                    topMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                                }`}
                            >
                                {t(mode === "foundation" ? "modeFoundation" : "modeQuest")}
                            </button>
                        ))}
                    </div>
                </div>

                {insecure && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                        {t("errors.insecureContext")}
                    </div>
                )}

                {/* Who is answering: decides both the detector and, for voices, the register. */}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                    {styles.map(style => (
                        <Chip key={style} active={answerStyle === style} disabled={locked} onClick={() => chooseStyle(style)}>
                            {t(`input.${style}`)}
                        </Chip>
                    ))}
                    {topMode === "foundation" && answerStyle === "voice" && (
                        <>
                            <span className="mx-1 h-4 w-px bg-gray-200" />
                            {(["female", "male"] as Singer[]).map(s => (
                                <Chip key={s} tone="indigo" active={singer === s} disabled={locked} onClick={() => chooseSinger(s)} title={t(`singerHint.${s}`)}>
                                    {t(`singer.${s}`)}
                                </Chip>
                            ))}
                        </>
                    )}
                    <select
                        value={tolerance}
                        disabled={locked}
                        onChange={e => setTolerance(Number(e.target.value) as Tolerance)}
                        title={t("toleranceLabel")}
                        className="ml-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600"
                    >
                        {TOLERANCES.map(v => (
                            <option key={v} value={v}>
                                {t(`tolerance.${v}`)}
                            </option>
                        ))}
                    </select>
                </div>

                {topMode === "foundation" ? (
                    <div className="mt-4 space-y-3">
                        <KeyLadder ladder={KEY_LADDER} selectedId={selectedKey.id} cleared={progress.keysCleared} disabled={locked} onSelect={chooseKey} t={t} />

                        <div className="grid grid-cols-4 gap-2">
                            {FOUNDATION_STAGES.map(stg => (
                                <button
                                    key={stg}
                                    type="button"
                                    disabled={locked}
                                    onClick={() => {
                                        setLoopActive(false);
                                        setFoundationStage(stg);
                                        void startFoundationRound(stg, homeRung);
                                    }}
                                    className={`flex flex-col items-center rounded-2xl border px-2 py-2.5 transition-all disabled:opacity-50 ${
                                        foundationStage === stg && !loopActive
                                            ? "border-teal-400 bg-teal-50 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-teal-200"
                                    }`}
                                >
                                    <span className="text-xl">{STAGE_ICON[stg]}</span>
                                    <span className="mt-0.5 text-sm font-semibold text-gray-800">{t(`stages.${stg}.name`)}</span>
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-500">{t(`stages.${foundationStage}.tip`)}</span>
                            <button
                                type="button"
                                disabled={locked}
                                onClick={() => {
                                    const next = !loopActive;
                                    setLoopActive(next);
                                    if (next) void startMasteryLoop();
                                }}
                                className={`ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                                    loopActive
                                        ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm"
                                        : "border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                                }`}
                            >
                                <Flame className="h-3.5 w-3.5" />
                                {t("loopToggle")}
                            </button>
                        </div>

                        {foundationStage === "home" && (
                            <div className="flex flex-wrap gap-1.5">
                                {HOME_RUNGS.map(r => (
                                    <Chip
                                        key={r}
                                        active={homeRung === r}
                                        disabled={locked}
                                        onClick={() => {
                                            setHomeRung(r);
                                            void startFoundationRound("home", r);
                                        }}
                                    >
                                        {t(`rungs.${r}`)}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
                        {WORLD_IDS.map(id => (
                            <button
                                key={id}
                                type="button"
                                disabled={locked}
                                title={t(`worlds.${id}.blurb`)}
                                onClick={() => {
                                    setWorld(id);
                                    void startQuestRound(id);
                                }}
                                className={`rounded-2xl border px-2 py-2.5 text-center transition-all disabled:opacity-50 ${
                                    world === id ? "border-amber-400 bg-amber-50 shadow-sm" : "border-gray-200 bg-white hover:border-amber-200"
                                }`}
                            >
                                <div className="text-xs text-gray-400">W{id}</div>
                                <div className="text-sm font-semibold text-gray-800">{t(`worlds.${id}.name`)}</div>
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-5 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
                    {!lick ? (
                        <div className="py-10 text-center">
                            <button
                                type="button"
                                onClick={() =>
                                    void (topMode === "foundation" ? (loopActive ? startMasteryLoop() : startFoundationRound()) : startQuestRound(world))
                                }
                                className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-8 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:scale-105 hover:bg-teal-700"
                            >
                                <Play className="h-5 w-5" />
                                {t("start")}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                {topMode === "foundation" && (
                                    <span className="rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-800">{t(`keys.${selectedKey.id}`)}</span>
                                )}
                                {loopActive && foundationRound?.loopStep && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 font-semibold text-orange-700">
                                        {[1, 2, 3, 4].map(n => (
                                            <span key={n} className={`h-1.5 w-4 rounded-full ${n <= foundationRound.loopStep! ? "bg-orange-500" : "bg-orange-200"}`} />
                                        ))}
                                    </span>
                                )}
                                {revealed.key && <span className="font-medium text-teal-700">{t("revealedKey", { key: noteName(lick.tonicMidi) })}</span>}
                                {answerStyle === "singThenPlay" && (
                                    <span className={`rounded-full px-2.5 py-1 font-medium ${singLocked ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                                        {singLocked ? t("singLockSuccess") : t("singLockPrompt")}
                                    </span>
                                )}
                                <span className="ml-auto rounded-full bg-gray-50 px-2.5 py-1 font-medium text-gray-500">{t(`phase.${phase}`)}</span>
                            </div>

                            <div className="mt-4 rounded-2xl bg-[#fffdf7] px-2 py-3 ring-1 ring-amber-100/70">
                                <TrebleStaffSvg
                                    glyphs={displayedStaffGlyphs}
                                    keySignature={foundationRound?.keySignature ?? []}
                                    flats={foundationRound?.flats ?? false}
                                    octaveDown={foundationRound?.voice === "male"}
                                    showSolfege={showSolfege}
                                    showSteppingStones={showSteppingStones}
                                    noteScores={phase === "result" ? score?.noteScores : undefined}
                                />
                                {phase === "result" && foundationRound?.stage === "home" && (
                                    <div className="mt-1 text-center text-xs font-medium text-teal-700">{foundationRound.resolutionFormula}</div>
                                )}
                            </div>

                            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                                <Chip active={showSolfege} onClick={() => setShowSolfege(s => !s)}>
                                    {t("showSolfege")}
                                </Chip>
                                {foundationRound?.stage === "sight" && (
                                    <Chip tone="indigo" active={showSteppingStones} onClick={() => setShowSteppingStones(s => !s)}>
                                        {t("showSteppingStones")}
                                    </Chip>
                                )}
                                {(foundationRound?.stage === "echo" || foundationRound?.stage === "sight") && (
                                    <Chip tone="amber" active={withDrone} onClick={() => setWithDrone(d => !d)}>
                                        {t("droneToggle")}
                                    </Chip>
                                )}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2.5">
                                <button
                                    type="button"
                                    disabled={locked}
                                    onClick={() => void replay()}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-teal-50 disabled:opacity-40"
                                >
                                    {phase === "prompt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                                    {t("replay")}
                                    {topMode === "quest" && (
                                        <span className="text-xs text-gray-400">{t("replaysLeft", { count: ledger.freeReplaysRemaining, total: FREE_REPLAYS })}</span>
                                    )}
                                </button>

                                {foundationRound?.stage === "sight" && (
                                    <button
                                        type="button"
                                        disabled={locked}
                                        onClick={() => void playFullReferenceMelody()}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 text-sm text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-40"
                                    >
                                        <Play className="h-4 w-4" />
                                        {t("playDemo")}
                                    </button>
                                )}

                                {phase === "recording" ? (
                                    <button
                                        type="button"
                                        onClick={() => void stopAndGrade()}
                                        className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700"
                                    >
                                        <Square className="h-4 w-4 fill-current" />
                                        {t("stop")}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void startRecording()}
                                        className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
                                    >
                                        {phase === "grading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                                        {phase === "grading" ? t("grading") : singing ? t("recordVoice") : t("recordViolin")}
                                    </button>
                                )}

                                {loopActive && phase === "result" ? (
                                    <button
                                        type="button"
                                        onClick={() => void advanceMasteryLoop()}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                                    >
                                        {t("nextLoopStep")}
                                        <ArrowRight className="h-4 w-4" />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={locked}
                                        onClick={() => void (topMode === "foundation" ? startFoundationRound() : startQuestRound(world))}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        {t("nextRound")}
                                    </button>
                                )}
                            </div>

                            {topMode === "quest" && (
                                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                                    {OFFERED_HINTS.map(hint => (
                                        <button
                                            key={hint}
                                            type="button"
                                            disabled={locked || ledger.used.includes(hint)}
                                            onClick={() => void applyHint(hint)}
                                            className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-600 transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:opacity-40"
                                        >
                                            💡 {t(`hints.${hint}`)}
                                            <span className="ml-1 text-gray-400">−{Math.round(HINT_CATALOG[hint].penalty * 100)}%</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {error && <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

                            {score && track && (
                                <div className="mt-6 border-t border-gray-100 pt-6">
                                    <div className="flex flex-wrap items-center gap-4">
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3].map(n => (
                                                <Star
                                                    key={n}
                                                    className={`h-8 w-8 transition-all duration-500 ${n <= score.stars ? "scale-110 fill-amber-400 text-amber-400" : "text-gray-200"}`}
                                                    style={{ transitionDelay: `${n * 120}ms` }}
                                                />
                                            ))}
                                            <span className="ml-2 text-2xl font-bold text-gray-900">{Math.round(score.total * 100)}</span>
                                        </div>
                                        {reward && phase === "result" && <RewardCard reward={reward} stars={score.stars} t={t} />}
                                    </div>

                                    <div className="mt-5 grid grid-cols-3 gap-4">
                                        {[
                                            { label: t("axis.sequence"), value: score.sequence },
                                            { label: t("axis.intonation"), value: score.intonation },
                                            { label: t("axis.rhythm"), value: score.rhythm },
                                        ].map(axis => (
                                            <div key={axis.label}>
                                                <div className="flex items-baseline justify-between">
                                                    <span className="text-xs text-gray-500">{axis.label}</span>
                                                    <span className="text-sm font-medium text-gray-800">
                                                        {axis.value === null ? t("axis.na") : Math.round(axis.value * 100)}
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                                    <div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${(axis.value ?? 0) * 100}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <ul className="mt-5 space-y-1.5">
                                        {score.feedback.map((item, i) => (
                                            <li key={i} className="text-sm text-gray-600">
                                                {renderFeedback(item, t)}
                                            </li>
                                        ))}
                                    </ul>

                                    <details className="mt-4 rounded-2xl bg-gray-50/80 p-3">
                                        <summary className="cursor-pointer text-xs font-medium text-gray-500">{t("details")}</summary>
                                        <div className="mt-3">
                                            <PitchCurve track={track} lick={lick} />
                                        </div>
                                        <div className="mt-4 space-y-2">
                                            {score.noteScores.map(note => (
                                                <div key={note.targetIndex} className="flex items-center gap-3">
                                                    <span className="w-12 shrink-0 text-sm font-medium text-gray-700">{noteName(note.targetMidi)}</span>
                                                    <span className="w-20 shrink-0 text-xs text-gray-400">
                                                        {note.fingering
                                                            ? t(`fingering.${note.fingering.finger}`, { string: ["G", "D", "A", "E"][note.fingering.stringIndex]! })
                                                            : ""}
                                                    </span>
                                                    <div className="flex-1">
                                                        {note.centsError === null ? (
                                                            <div className="h-2.5 rounded-full bg-gray-100" />
                                                        ) : (
                                                            <CentsBar cents={note.centsError} tolerance={score.toleranceCents} />
                                                        )}
                                                    </div>
                                                    <span
                                                        className={`w-14 shrink-0 text-right text-xs tabular-nums ${
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
                                    </details>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="mt-4">
                    <BadgeShelf earned={progress.badges} t={t} />
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
                    item.notes.map(n => t("feedback.wrongNoteItem", { index: n.index, expected: n.expected })),
                    item.truncated,
                ),
            });
        case "badlyTuned":
            return t("feedback.badlyTuned", {
                items: join(
                    item.notes.map(n => t("feedback.badlyTunedItem", { expected: n.expected, cents: `${n.cents > 0 ? "+" : ""}${n.cents}` })),
                    item.truncated,
                ),
            });
        case "extraNotes":
            return t("feedback.extraNotes", { count: item.count });
        case "openStringDetuned":
            return t("feedback.openStringDetuned", {
                strings: item.strings.map(s => t("feedback.stringName", { name: s })).join(t("feedback.separator")),
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
