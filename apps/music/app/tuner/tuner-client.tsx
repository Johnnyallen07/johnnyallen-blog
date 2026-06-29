"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart3,
    ChevronDown,
    Gauge,
    KeyboardMusic,
    Mic,
    MicOff,
    Minus,
    Plus,
    SlidersHorizontal,
    Timer,
    Volume2,
    X,
} from "lucide-react";

import {
    buildPianoKeys,
    createPitchTracker,
    createSustainedNoteEvaluator,
    estimatePitchFromTimeDomain,
    formatSignedDecimal,
    frequencyForMidi,
    getEvaluatorConfig,
    getPianoVoicePartials,
    getToleranceHz,
    getTrackerConfig,
    noteFromFrequency,
    notePartsForMidi,
    smoothPathSegments,
    type NoteVerdict,
    type PitchEstimate,
    type PitchTracker,
    type PianoKey,
    type ResponseMode,
    type SustainedNoteEvaluator,
    type TunerMode,
} from "../../lib/tuner";
import {
    advanceSchedule,
    blankWindowFor,
    clampBeatsPerBar,
    clampBpm,
    MAX_BPM,
    MIN_BPM,
    type MetronomeClick,
    type ScheduleCursor,
} from "../../lib/metronome";

type AudioContextCtor = typeof AudioContext;
type ScriptProcessorAudioContext = AudioContext & {
    createScriptProcessor: (
        bufferSize?: number,
        numberOfInputChannels?: number,
        numberOfOutputChannels?: number,
    ) => ScriptProcessorNode;
};

declare global {
    interface Window {
        webkitAudioContext?: AudioContextCtor;
    }
}

const ANALYSIS_FRAME_SIZE = 4096;
// Trajectory window: shorter = faster scroll (vibrato becomes visible).
const MIN_TRACE_WINDOW_MS = 2000;
const MAX_TRACE_WINDOW_MS = 20000;
const DEFAULT_TRACE_WINDOW_MS = 5000;

interface PitchSample {
    /** Wall-clock timestamp (ms) of the underlying frame. */
    at: number;
    /** Voiced-clock timestamp (ms) — only advances while sound is recorded. */
    traceMs: number;
    frequency: number;
    targetHz: number;
    hzDelta: number;
    cents: number;
    confidence: number;
    rms: number;
    label: string;
}

interface MicNodes {
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    highPass: BiquadFilterNode;
    processor?: AudioWorkletNode;
    scriptProcessor?: ScriptProcessorNode;
    silentGain: GainNode;
}

interface BlankWindow {
    from: number;
    to: number;
}

interface NoteStat {
    midi: number;
    label: string;
    total: number;
    outOfTune: number;
    flat: number;
    sharp: number;
    sumAbsCents: number;
}

const MODES: { id: TunerMode; label: string; tolerance: string }[] = [
    { id: "standard", label: "标准", tolerance: "±5 Hz" },
    { id: "strict", label: "严格", tolerance: "±3 Hz" },
    { id: "custom", label: "自定义", tolerance: "手动" },
];

const RESPONSE_LABELS: Record<ResponseMode, { label: string; hint: string }> = {
    stable: { label: "稳定", hint: "重平滑，慢响应" },
    standard: { label: "标准", hint: "平衡" },
    sensitive: { label: "灵敏", hint: "轻平滑，快响应" },
};

function useIsMobile(query = "(max-width: 1023px)"): boolean {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        const update = () => setIsMobile(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, [query]);
    return isMobile;
}

/**
 * Card with a header that can collapse its body. On desktop panels stay open
 * (`collapsible=false`); on small screens they fold away so the page is not
 * overwhelming. An optional `action` button lives in the header and never
 * triggers the collapse.
 */
function Panel({
    icon,
    title,
    action,
    collapsible,
    defaultOpen = true,
    children,
}: {
    icon?: React.ReactNode;
    title: string;
    action?: React.ReactNode;
    collapsible: boolean;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const isOpen = collapsible ? open : true;

    return (
        <div className="rounded-lg border border-slate-200 bg-white/78 shadow-sm">
            <div className={`flex items-center justify-between gap-2 px-4 ${isOpen ? "pt-4 pb-3" : "py-3"}`}>
                <button
                    type="button"
                    onClick={collapsible ? () => setOpen((value) => !value) : undefined}
                    disabled={!collapsible}
                    className="flex flex-1 items-center gap-2 text-left text-sm font-bold text-slate-900 disabled:cursor-default"
                >
                    {icon}
                    <span>{title}</span>
                    {collapsible && (
                        <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
                    )}
                </button>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {isOpen && <div className="px-4 pb-4">{children}</div>}
        </div>
    );
}

function TunerMeter({
    samples,
    toleranceHz,
    traceClockRef,
    traceWindowMsRef,
    recordingRef,
    isListening,
}: {
    samples: React.MutableRefObject<PitchSample[]>;
    toleranceHz: number;
    traceClockRef: React.MutableRefObject<number>;
    traceWindowMsRef: React.MutableRefObject<number>;
    recordingRef: React.MutableRefObject<boolean>;
    isListening: boolean;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let frameId = 0;
        let lastTs = performance.now();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const draw = () => {
            const rect = canvas.getBoundingClientRect();
            const pixelRatio = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.floor(rect.width * pixelRatio));
            const height = Math.max(1, Math.floor(rect.height * pixelRatio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            // The trajectory clock only advances while sound is being recorded,
            // so the trace freezes during silence and resumes on the next note.
            const ts = performance.now();
            const delta = ts - lastTs;
            lastTs = ts;
            if (recordingRef.current) traceClockRef.current += delta;
            const traceNow = traceClockRef.current;
            const traceWindowMs = traceWindowMsRef.current;

            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);

            const centerX = rect.width / 2;
            const usableWidth = Math.max(160, rect.width - 72);
            const scale = usableWidth / 2 / Math.max(20, toleranceHz * 2.2);
            const bandHalfWidth = toleranceHz * scale;

            ctx.fillStyle = "#18181b";
            ctx.fillRect(0, 0, rect.width, rect.height);

            ctx.fillStyle = "#152c25";
            ctx.fillRect(centerX - bandHalfWidth, 0, bandHalfWidth * 2, rect.height);
            ctx.fillStyle = "#1f8f6f";
            ctx.fillRect(centerX - Math.min(bandHalfWidth, 6), 0, Math.min(bandHalfWidth, 6) * 2, rect.height);

            ctx.strokeStyle = "rgba(255,255,255,0.14)";
            ctx.lineWidth = 1;
            for (let hz = -20; hz <= 20; hz += 5) {
                const x = centerX + hz * scale;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, rect.height);
                ctx.stroke();
            }

            ctx.strokeStyle = "rgba(255,255,255,0.62)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, rect.height);
            ctx.stroke();

            const activeSamples = samples.current.filter((sample) => traceNow - sample.traceMs <= traceWindowMs);
            samples.current = activeSamples;

            const plotPoint = (sample: PitchSample) => ({
                x: centerX + Math.max(-42, Math.min(42, sample.hzDelta)) * scale,
                y: rect.height - ((traceNow - sample.traceMs) / traceWindowMs) * rect.height,
            });

            const points = activeSamples.map(plotPoint);
            // Smooth the polyline into curves: gentle bends for a tight vibrato
            // wobble, broader arcs when the pitch travels further between frames.
            const curve = smoothPathSegments(points);

            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            // Red/amber shading measures how far the line sits OUTSIDE the green
            // band — anchored at the band edge, not the centre — so anything in
            // tune stays clean and only real excursions are highlighted. The
            // trajectory side of each patch follows the same curve as the line.
            for (let index = 0; index < curve.length; index += 1) {
                const previous = activeSamples[index]!;
                const current = activeSamples[index + 1]!;
                const avgDelta = (previous.hzDelta + current.hzDelta) / 2;
                const beyond = Math.abs(avgDelta) - toleranceHz;
                if (beyond <= 0.05) continue;

                const flat = avgDelta < 0;
                const edgeX = centerX + (flat ? -bandHalfWidth : bandHalfWidth);
                const start = points[index]!;
                const segment = curve[index]!;
                const intensity = Math.min(1, beyond / Math.max(2, toleranceHz));
                const alpha = 0.2 + intensity * 0.5;
                ctx.fillStyle = flat
                    ? `rgba(239, 68, 68, ${alpha.toFixed(3)})`
                    : `rgba(245, 158, 11, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(edgeX, start.y);
                ctx.lineTo(start.x, start.y);
                ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
                ctx.lineTo(edgeX, segment.end.y);
                ctx.closePath();
                ctx.fill();
            }

            const strokeCurve = () => {
                if (points.length === 0) return;
                ctx.beginPath();
                ctx.moveTo(points[0]!.x, points[0]!.y);
                if (curve.length === 0) {
                    ctx.lineTo(points[0]!.x, points[0]!.y);
                } else {
                    for (const segment of curve) {
                        ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
                    }
                }
                ctx.stroke();
            };

            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            strokeCurve();

            ctx.lineWidth = 2.6;
            ctx.strokeStyle = "#fafafa";
            strokeCurve();

            if (activeSamples.length > 0) {
                const head = points[points.length - 1]!;
                ctx.fillStyle = recordingRef.current ? "#34d399" : "rgba(250,250,250,0.55)";
                ctx.beginPath();
                ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }

            if (activeSamples.length === 0) {
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.font = "600 14px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(isListening ? "等待声音…" : "麦克风待机", rect.width / 2, rect.height / 2);
                ctx.textAlign = "start";
            }

            frameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(frameId);
    }, [isListening, recordingRef, samples, toleranceHz, traceClockRef, traceWindowMsRef]);

    return (
        <canvas
            ref={canvasRef}
            className="h-[430px] w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-inner md:h-[560px]"
            aria-label="实时音准轨迹"
        />
    );
}

function PianoKeyboard({
    keys,
    onPlay,
}: {
    keys: PianoKey[];
    onPlay: (key: PianoKey) => void;
}) {
    const whiteKeys = keys.filter((key) => !key.accidental);

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative h-44 min-w-[760px]">
                <div className="flex h-full">
                    {whiteKeys.map((key) => {
                        return (
                            <button
                                key={key.midi}
                                type="button"
                                onPointerDown={() => onPlay(key)}
                                className="relative h-full flex-1 border border-slate-300 bg-white text-slate-700 transition hover:bg-emerald-50 active:bg-emerald-100"
                                title={`${key.label} ${key.frequency.toFixed(1)}Hz`}
                            >
                                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-semibold">
                                    {key.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {keys.filter((key) => key.accidental).map((key) => {
                    const precedingWhiteCount = whiteKeys.filter((white) => white.midi < key.midi).length;
                    return (
                        <button
                            key={key.midi}
                            type="button"
                            onPointerDown={() => onPlay(key)}
                            className="absolute top-0 z-10 h-28 w-10 -translate-x-1/2 rounded-b-md bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-700 active:bg-emerald-900"
                            style={{ left: `${(precedingWhiteCount / whiteKeys.length) * 100}%` }}
                            title={`${key.label} ${key.frequency.toFixed(1)}Hz`}
                        >
                            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold">
                                {key.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Compact chromatic pad for phones, where a full keyboard has no room. */
function NoteButtons({ onPlay }: { onPlay: (key: PianoKey) => void }) {
    const [octave, setOctave] = useState(4);

    return (
        <div>
            <div className="mb-3 flex items-center justify-center gap-4">
                <button
                    type="button"
                    onClick={() => setOctave((value) => Math.max(1, value - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    aria-label="降低八度"
                >
                    <Minus className="h-4 w-4" />
                </button>
                <div className="text-sm font-bold tabular-nums text-slate-900">八度 {octave}</div>
                <button
                    type="button"
                    onClick={() => setOctave((value) => Math.min(7, value + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    aria-label="提高八度"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, index) => {
                    const midi = 12 * (octave + 1) + index;
                    const parts = notePartsForMidi(midi);
                    return (
                        <button
                            key={parts.name}
                            type="button"
                            onPointerDown={() => onPlay({ midi, ...parts, frequency: frequencyForMidi(midi) })}
                            className={`rounded-lg py-3 text-sm font-bold transition active:scale-95 ${
                                parts.accidental
                                    ? "bg-zinc-900 text-white hover:bg-zinc-700"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50"
                            }`}
                            title={`${parts.label} ${frequencyForMidi(midi).toFixed(1)}Hz`}
                        >
                            {parts.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function TunerPageClient() {
    const isMobile = useIsMobile();
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState("");
    const [latest, setLatest] = useState<PitchSample | null>(null);
    const [mode, setMode] = useState<TunerMode>("standard");
    const [customToleranceHz, setCustomToleranceHz] = useState(10);
    const [responseMode, setResponseMode] = useState<ResponseMode>("standard");
    const [traceWindowMs, setTraceWindowMs] = useState(DEFAULT_TRACE_WINDOW_MS);

    const [metronomeOn, setMetronomeOn] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerBar, setBeatsPerBar] = useState(4);
    const [metronomeVolume, setMetronomeVolume] = useState(0.6);
    const [activeBeat, setActiveBeat] = useState(-1);

    const [statsEnabled, setStatsEnabled] = useState(false);
    const [noteStats, setNoteStats] = useState<NoteStat[]>([]);
    const [statsModalOpen, setStatsModalOpen] = useState(false);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const micNodesRef = useRef<MicNodes | null>(null);
    const trackerRef = useRef<PitchTracker | null>(null);
    const samplesRef = useRef<PitchSample[]>([]);
    const traceClockRef = useRef<number>(0);
    const recordingRef = useRef<boolean>(false);
    const blankWindowsRef = useRef<BlankWindow[]>([]);
    const evaluatorRef = useRef<SustainedNoteEvaluator | null>(null);
    const statsEnabledRef = useRef(false);
    const toleranceHzRef = useRef(5);
    const traceWindowMsRef = useRef(DEFAULT_TRACE_WINDOW_MS);

    const toleranceHz = getToleranceHz(mode, customToleranceHz);
    toleranceHzRef.current = toleranceHz;
    traceWindowMsRef.current = traceWindowMs;
    statsEnabledRef.current = statsEnabled;
    const pianoKeys = useMemo(() => buildPianoKeys(48, 84), []);
    const displayNote = latest ? noteFromFrequency(latest.frequency) : null;
    const withinTolerance = latest ? Math.abs(latest.hzDelta) <= toleranceHz : false;

    useEffect(() => {
        const saved = localStorage.getItem("MUSIC_TUNER_SETTINGS");
        if (!saved) return;
        try {
            const settings = JSON.parse(saved) as {
                mode?: TunerMode;
                customToleranceHz?: number;
                responseMode?: ResponseMode;
                bpm?: number;
                beatsPerBar?: number;
                metronomeVolume?: number;
                traceWindowMs?: number;
            };
            if (settings.mode === "standard" || settings.mode === "strict" || settings.mode === "custom") {
                setMode(settings.mode);
            }
            if (typeof settings.customToleranceHz === "number") setCustomToleranceHz(settings.customToleranceHz);
            if (settings.responseMode === "stable" || settings.responseMode === "standard" || settings.responseMode === "sensitive") {
                setResponseMode(settings.responseMode);
            }
            if (typeof settings.bpm === "number") setBpm(clampBpm(settings.bpm));
            if (typeof settings.beatsPerBar === "number") setBeatsPerBar(clampBeatsPerBar(settings.beatsPerBar));
            if (typeof settings.metronomeVolume === "number") {
                setMetronomeVolume(Math.max(0, Math.min(1, settings.metronomeVolume)));
            }
            if (typeof settings.traceWindowMs === "number") {
                setTraceWindowMs(Math.max(MIN_TRACE_WINDOW_MS, Math.min(MAX_TRACE_WINDOW_MS, settings.traceWindowMs)));
            }
        } catch {
            localStorage.removeItem("MUSIC_TUNER_SETTINGS");
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("MUSIC_TUNER_SETTINGS", JSON.stringify({
            mode,
            customToleranceHz,
            responseMode,
            bpm,
            beatsPerBar,
            metronomeVolume,
            traceWindowMs,
        }));
    }, [beatsPerBar, bpm, customToleranceHz, metronomeVolume, mode, responseMode, traceWindowMs]);

    // Rebuild the tracker whenever the response profile changes.
    useEffect(() => {
        trackerRef.current = createPitchTracker(getTrackerConfig(responseMode));
        samplesRef.current = [];
        recordingRef.current = false;
        setLatest(null);
    }, [responseMode]);

    // The intonation evaluator lives for the page session.
    useEffect(() => {
        evaluatorRef.current = createSustainedNoteEvaluator(getEvaluatorConfig());
    }, []);

    const recordVerdict = useCallback((verdict: NoteVerdict) => {
        setNoteStats((previous) => {
            const next = previous.slice();
            const index = next.findIndex((stat) => stat.midi === verdict.midi);
            const base: NoteStat = index >= 0
                ? { ...next[index]! }
                : { midi: verdict.midi, label: verdict.label, total: 0, outOfTune: 0, flat: 0, sharp: 0, sumAbsCents: 0 };
            base.total += 1;
            base.sumAbsCents += Math.abs(verdict.medianCents);
            if (!verdict.inTune) {
                base.outOfTune += 1;
                if (verdict.direction === "flat") base.flat += 1;
                else if (verdict.direction === "sharp") base.sharp += 1;
            }
            if (index >= 0) next[index] = base;
            else next.push(base);
            return next;
        });
    }, []);

    const ensureAudioContext = useCallback(() => {
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
            void audioCtxRef.current.resume();
            return audioCtxRef.current;
        }
        const ContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!ContextCtor) return null;
        const context = new ContextCtor({ latencyHint: "interactive" });
        audioCtxRef.current = context;
        return context;
    }, []);

    // Stable across re-renders: the worklet message handler keeps this exact
    // reference, so everything dynamic is read from refs.
    const handleRaw = useCallback((estimate: PitchEstimate & { blanked?: boolean }) => {
        const tracker = trackerRef.current;
        if (!tracker) return;

        const now = performance.now();
        const result = tracker.push({
            frequency: estimate.frequency,
            confidence: estimate.confidence,
            rms: estimate.rms,
            at: now,
            blanked: estimate.blanked,
        });

        recordingRef.current = result.recording;

        const note = result.frequency > 0 ? noteFromFrequency(result.frequency) : null;

        // Feed the intonation evaluator: only confirmed, recorded frames carry a
        // note; everything else flushes the in-progress note.
        if (statsEnabledRef.current && evaluatorRef.current) {
            const verdict = evaluatorRef.current.push(
                result.recording && note
                    ? {
                        at: now,
                        recording: true,
                        midi: note.midi,
                        label: note.label,
                        cents: note.cents,
                        hzDelta: note.hzDelta,
                        toleranceHz: toleranceHzRef.current,
                    }
                    : { at: now, recording: false },
            );
            if (verdict) recordVerdict(verdict);
        }

        if (result.phase === "idle" || !note) {
            if (result.phase === "idle") setLatest(null);
            return;
        }

        const sample: PitchSample = {
            at: now,
            traceMs: traceClockRef.current,
            frequency: result.frequency,
            targetHz: note.targetHz,
            hzDelta: note.hzDelta,
            cents: note.cents,
            confidence: estimate.confidence,
            rms: estimate.rms,
            label: note.label,
        };

        setLatest(sample);
        if (result.recording) samplesRef.current.push(sample);
    }, [recordVerdict]);

    const teardownMic = useCallback(() => {
        const nodes = micNodesRef.current;
        micNodesRef.current = null;
        if (!nodes) return;
        if (nodes.scriptProcessor) nodes.scriptProcessor.onaudioprocess = null;
        nodes.stream.getTracks().forEach((track) => track.stop());
        nodes.source.disconnect();
        nodes.highPass.disconnect();
        nodes.processor?.port.postMessage({ type: "clear" });
        nodes.processor?.disconnect();
        nodes.scriptProcessor?.disconnect();
        nodes.silentGain.disconnect();
    }, []);

    const stopListening = useCallback(() => {
        teardownMic();
        trackerRef.current?.reset();
        // Finalise any note still in progress so it is not lost from the stats.
        const verdict = evaluatorRef.current?.flush();
        if (verdict && statsEnabledRef.current) recordVerdict(verdict);
        recordingRef.current = false;
        setIsListening(false);
        setLatest(null);
    }, [recordVerdict, teardownMic]);

    const startListening = useCallback(async () => {
        setError("");
        const context = ensureAudioContext();
        if (!context || !navigator.mediaDevices?.getUserMedia) {
            setError("当前浏览器不支持实时麦克风调音。");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
            const source = context.createMediaStreamSource(stream);
            const highPass = context.createBiquadFilter();
            highPass.type = "highpass";
            highPass.frequency.value = 55;
            highPass.Q.value = 0.7;
            const silentGain = context.createGain();
            silentGain.gain.value = 0;

            source.connect(highPass);

            const nodes: MicNodes = { stream, source, highPass, silentGain };

            const canUseWorklet = typeof AudioWorkletNode !== "undefined" && typeof context.audioWorklet?.addModule === "function";

            if (canUseWorklet) {
                await context.audioWorklet.addModule("/worklets/tuner-processor.js");
                const processor = new AudioWorkletNode(context, "tuner-processor");
                processor.port.onmessage = (event: MessageEvent<PitchEstimate & { blanked?: boolean }>) => handleRaw(event.data);
                highPass.connect(processor);
                processor.connect(silentGain).connect(context.destination);
                nodes.processor = processor;
            } else {
                const scriptContext = context as ScriptProcessorAudioContext;
                const scriptProcessor = scriptContext.createScriptProcessor(ANALYSIS_FRAME_SIZE, 1, 1);
                scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
                    const frame = event.inputBuffer.getChannelData(0);
                    const estimate = estimatePitchFromTimeDomain(frame, scriptContext.sampleRate);
                    // No worklet clock here, so blank on the main thread instead.
                    const now = scriptContext.currentTime;
                    blankWindowsRef.current = blankWindowsRef.current.filter((window) => window.to >= now - 0.5);
                    const blanked = blankWindowsRef.current.some((window) => window.from <= now && window.to >= now);
                    handleRaw({ ...estimate, blanked });
                };
                highPass.connect(scriptProcessor);
                scriptProcessor.connect(silentGain).connect(scriptContext.destination);
                nodes.scriptProcessor = scriptProcessor;
            }

            micNodesRef.current = nodes;
            await context.resume();
            setIsListening(true);
        } catch (err) {
            console.error(err);
            setError("无法打开麦克风，请检查浏览器权限或输入设备。");
            stopListening();
        }
    }, [ensureAudioContext, handleRaw, stopListening]);

    useEffect(() => () => {
        teardownMic();
        const context = audioCtxRef.current;
        audioCtxRef.current = null;
        if (context && context.state !== "closed") void context.close();
    }, [teardownMic]);

    const toggleListening = () => {
        if (isListening) stopListening();
        else void startListening();
    };

    // ---- Metronome scheduler (lookahead, shares the tuner's clock) -------------
    const metronomeStateRef = useRef({ bpm, beatsPerBar, volume: metronomeVolume });
    metronomeStateRef.current = { bpm, beatsPerBar, volume: metronomeVolume };
    const schedulerRef = useRef<number | null>(null);
    const cursorRef = useRef<ScheduleCursor>({ nextNoteTime: 0, beat: 0 });

    const emitClick = useCallback((context: AudioContext, click: MetronomeClick) => {
        const { volume } = metronomeStateRef.current;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(click.accent ? 2000 : 1200, click.time);
        const peak = Math.max(0.0001, volume * (click.accent ? 1 : 0.62));
        gain.gain.setValueAtTime(0.0001, click.time);
        gain.gain.exponentialRampToValueAtTime(peak, click.time + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.0001, click.time + 0.045);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(click.time);
        oscillator.stop(click.time + 0.06);

        // Blank pitch analysis around the click so the mic-captured tick cannot
        // corrupt detection. The window covers output + input latency plus the
        // analysis frame length.
        const latency = (context.outputLatency || 0.02)
            + (context.baseLatency || 0.01)
            + ANALYSIS_FRAME_SIZE / context.sampleRate
            + 0.04;
        const blank = blankWindowFor(click.time, latency);
        blankWindowsRef.current = blankWindowsRef.current.filter((window) => window.to >= context.currentTime - 0.5);
        blankWindowsRef.current.push(blank);
        micNodesRef.current?.processor?.port.postMessage({ type: "blank", ...blank });

        const delayMs = Math.max(0, (click.time - context.currentTime) * 1000);
        window.setTimeout(() => setActiveBeat(click.beat), delayMs);
    }, []);

    const stopMetronome = useCallback(() => {
        if (schedulerRef.current !== null) {
            window.clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }
        setActiveBeat(-1);
    }, []);

    const startMetronome = useCallback(() => {
        const context = ensureAudioContext();
        if (!context) {
            setError("当前浏览器不支持节拍器。");
            return;
        }
        if (schedulerRef.current !== null) return;
        cursorRef.current = { nextNoteTime: context.currentTime + 0.12, beat: 0 };

        const lookahead = 0.12;
        const pump = () => {
            const { bpm: currentBpm, beatsPerBar: currentBeats } = metronomeStateRef.current;
            const { clicks, cursor } = advanceSchedule(
                cursorRef.current,
                context.currentTime + lookahead,
                currentBpm,
                currentBeats,
            );
            cursorRef.current = cursor;
            for (const click of clicks) emitClick(context, click);
        };

        pump();
        schedulerRef.current = window.setInterval(pump, 25);
    }, [emitClick, ensureAudioContext]);

    const toggleMetronome = () => {
        if (metronomeOn) {
            stopMetronome();
            setMetronomeOn(false);
        } else {
            startMetronome();
            setMetronomeOn(true);
        }
    };

    useEffect(() => () => stopMetronome(), [stopMetronome]);

    const playReferenceTone = useCallback((key: PianoKey) => {
        const context = ensureAudioContext();
        if (!context) return;

        const now = context.currentTime;
        const master = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(Math.min(9000, key.frequency * 16), now);
        filter.Q.setValueAtTime(0.55, now);
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
        filter.connect(master).connect(context.destination);

        getPianoVoicePartials(key.frequency).forEach((partial) => {
            const oscillator = context.createOscillator();
            const partialGain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(partial.frequency, now);
            oscillator.detune.setValueAtTime(partial.detuneCents, now);
            partialGain.gain.setValueAtTime(0.0001, now);
            partialGain.gain.exponentialRampToValueAtTime(partial.gain, now + 0.006);
            partialGain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decaySeconds);
            oscillator.connect(partialGain).connect(filter);
            oscillator.start(now);
            oscillator.stop(now + Math.max(0.35, partial.decaySeconds + 0.08));
        });

        const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.035), context.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseData.length; index += 1) {
            const decay = 1 - index / noiseData.length;
            noiseData[index] = (Math.random() * 2 - 1) * decay * 0.22;
        }
        const hammer = context.createBufferSource();
        const hammerGain = context.createGain();
        const hammerFilter = context.createBiquadFilter();
        hammer.buffer = noiseBuffer;
        hammerFilter.type = "bandpass";
        hammerFilter.frequency.setValueAtTime(Math.min(5200, key.frequency * 10), now);
        hammerFilter.Q.setValueAtTime(1.2, now);
        hammerGain.gain.setValueAtTime(0.08, now);
        hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        hammer.connect(hammerFilter).connect(hammerGain).connect(filter);
        hammer.start(now);
        hammer.stop(now + 0.05);
    }, [ensureAudioContext]);

    const resetSamples = () => {
        samplesRef.current = [];
        traceClockRef.current = 0;
        recordingRef.current = false;
        trackerRef.current?.reset();
        setLatest(null);
    };

    const toggleStats = () => {
        setStatsEnabled((enabled) => {
            const next = !enabled;
            // Drop the half-measured note so it cannot bleed across a toggle.
            evaluatorRef.current?.reset();
            return next;
        });
    };

    const clearStats = () => {
        evaluatorRef.current?.reset();
        setNoteStats([]);
    };

    const nudgeBpm = (delta: number) => setBpm((value) => clampBpm(value + delta));

    const sortedStats = useMemo(
        () => [...noteStats].sort((a, b) => b.outOfTune - a.outOfTune || a.midi - b.midi),
        [noteStats],
    );
    const totalNotes = noteStats.reduce((sum, stat) => sum + stat.total, 0);
    const totalOut = noteStats.reduce((sum, stat) => sum + stat.outOfTune, 0);
    const accuracy = totalNotes > 0 ? Math.round(((totalNotes - totalOut) / totalNotes) * 100) : null;

    const statsToggle = (
        <button
            type="button"
            onClick={toggleStats}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] ${statsEnabled ? "bg-zinc-800 hover:bg-zinc-950" : "bg-emerald-700 hover:bg-emerald-800"}`}
        >
            {statsEnabled ? "停止统计" : "开始统计"}
        </button>
    );

    const statsBody = (
        <>
            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[11px] text-slate-400">计数音</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{totalNotes}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[11px] text-slate-400">不准</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-red-600">{totalOut}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[11px] text-slate-400">准确率</div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">{accuracy === null ? "--" : `${accuracy}%`}</div>
                </div>
            </div>

            {sortedStats.length > 0 ? (
                <div className="mt-3 max-h-[320px] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white/95 text-[11px] uppercase text-slate-400">
                            <tr className="text-left">
                                <th className="py-1 font-semibold">音</th>
                                <th className="py-1 text-center font-semibold">次数</th>
                                <th className="py-1 text-center font-semibold">不准</th>
                                <th className="py-1 text-right font-semibold">平均偏差</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStats.map((stat) => (
                                <tr key={stat.midi} className="border-t border-slate-100">
                                    <td className="py-1.5 font-semibold text-slate-900">{stat.label}</td>
                                    <td className="py-1.5 text-center tabular-nums text-slate-500">{stat.total}</td>
                                    <td className="py-1.5 text-center tabular-nums">
                                        <span className={stat.outOfTune > 0 ? "font-semibold text-red-600" : "text-slate-300"}>
                                            {stat.outOfTune}
                                        </span>
                                        {stat.outOfTune > 0 && (
                                            <span className="ml-1 text-[10px] text-slate-400">
                                                {stat.flat > 0 ? `↓${stat.flat}` : ""}{stat.sharp > 0 ? ` ↑${stat.sharp}` : ""}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-500">
                                        ±{(stat.sumAbsCents / stat.total).toFixed(1)}¢
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="mt-3 text-[11px] leading-snug text-slate-400">
                    {statsEnabled
                        ? "统计中…只记录持续 ≥250ms 的稳定音，按中位偏差判断是否超出绿色范围（避免起音、滑音与揉弦误判）。"
                        : "开启后统计录音期间每个音的音准。"}
                </p>
            )}

            {sortedStats.length > 0 && (
                <button
                    type="button"
                    onClick={clearStats}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                    清空统计
                </button>
            )}
        </>
    );

    const keyboardAction = (
        <button
            type="button"
            onClick={() => displayNote && playReferenceTone({
                midi: displayNote.midi,
                name: displayNote.name,
                octave: displayNote.octave,
                label: displayNote.label,
                frequency: displayNote.targetHz,
                accidental: displayNote.name.includes("#"),
            })}
            disabled={!displayNote}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
            <Volume2 className="h-3.5 w-3.5" />
            当前目标音
        </button>
    );

    return (
        <div className="min-h-screen bg-[#f8f6f1] text-slate-950">
            <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6 md:py-7">
                <div className="mb-5 flex items-center justify-between gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        音乐库
                    </Link>
                    <button
                        type="button"
                        onClick={toggleListening}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] ${isListening ? "bg-zinc-800 hover:bg-zinc-950" : "bg-emerald-700 hover:bg-emerald-800"}`}
                    >
                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        {isListening ? "暂停" : "开始"}
                    </button>
                </div>

                <section className="mb-5 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                            <Gauge className="h-3.5 w-3.5" />
                            A4 440Hz
                        </div>
                        <h1 className="text-3xl font-bold tracking-normal text-slate-950 md:text-5xl">调音器</h1>
                    </div>

                    <div className="text-center">
                        <div className="text-[92px] font-black leading-none tracking-normal text-slate-950 md:text-[128px]">
                            {displayNote?.name ?? "--"}
                            {displayNote && <span className="ml-1 align-baseline text-4xl md:text-5xl">{displayNote.octave}</span>}
                        </div>
                        <div className={`mx-auto mt-2 h-2 w-28 rounded-full ${withinTolerance ? "bg-emerald-500" : latest ? "bg-red-500" : "bg-slate-300"}`} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:min-w-80">
                        <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm">
                            <div className="text-xs font-semibold uppercase text-slate-400">Hertz</div>
                            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-950">
                                {latest ? latest.frequency.toFixed(1) : "--"}
                            </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm">
                            <div className="text-xs font-semibold uppercase text-slate-400">Cents</div>
                            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-950">
                                {latest ? formatSignedDecimal(latest.cents) : "--"}
                            </div>
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {error}
                    </div>
                )}

                <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-4">
                        <div>
                            <TunerMeter
                                samples={samplesRef}
                                toleranceHz={toleranceHz}
                                traceClockRef={traceClockRef}
                                traceWindowMsRef={traceWindowMsRef}
                                recordingRef={recordingRef}
                                isListening={isListening}
                            />
                            <div className="mt-3 flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-500">轨迹速度</span>
                                <span className="text-[11px] text-slate-400">慢</span>
                                <input
                                    type="range"
                                    min={MIN_TRACE_WINDOW_MS}
                                    max={MAX_TRACE_WINDOW_MS}
                                    step={500}
                                    // Invert so dragging right = faster (shorter window).
                                    value={MIN_TRACE_WINDOW_MS + MAX_TRACE_WINDOW_MS - traceWindowMs}
                                    onChange={(event) =>
                                        setTraceWindowMs(MIN_TRACE_WINDOW_MS + MAX_TRACE_WINDOW_MS - Number(event.target.value))
                                    }
                                    className="flex-1 accent-emerald-700"
                                    aria-label="轨迹移动速度"
                                />
                                <span className="text-[11px] text-slate-400">快</span>
                                <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-600">
                                    {(traceWindowMs / 1000).toFixed(1)}s
                                </span>
                            </div>
                        </div>

                        {/* Keyboard sits directly under the tuner for quick reference tones. */}
                        <Panel
                            key={`kbd-${isMobile}`}
                            icon={<KeyboardMusic className="h-4 w-4 text-emerald-700" />}
                            title="钢琴键盘"
                            action={keyboardAction}
                            collapsible={isMobile}
                            defaultOpen={!isMobile}
                        >
                            {isMobile
                                ? <NoteButtons onPlay={playReferenceTone} />
                                : <PianoKeyboard keys={pianoKeys} onPlay={playReferenceTone} />}
                        </Panel>

                        {!isMobile && (
                            <Panel
                                icon={<BarChart3 className="h-4 w-4 text-emerald-700" />}
                                title="音准统计"
                                action={statsToggle}
                                collapsible={false}
                            >
                                {statsBody}
                            </Panel>
                        )}
                    </div>

                    <aside className="space-y-4">
                        <Panel
                            icon={<SlidersHorizontal className="h-4 w-4 text-emerald-700" />}
                            title="绿色范围"
                            collapsible={isMobile}
                        >
                            <div className="grid grid-cols-3 gap-2">
                                {MODES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setMode(item.id)}
                                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${mode === item.id ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                                    >
                                        <span className="block">{item.label}</span>
                                        <span className="text-[11px] font-medium text-slate-400">{item.tolerance}</span>
                                    </button>
                                ))}
                            </div>
                            {mode === "custom" && (
                                <div className="mt-4">
                                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                                        <span>容差</span>
                                        <span>±{customToleranceHz.toFixed(0)} Hz</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={20}
                                        value={customToleranceHz}
                                        onChange={(event) => setCustomToleranceHz(Number(event.target.value))}
                                        className="w-full accent-emerald-700"
                                    />
                                </div>
                            )}
                        </Panel>

                        <Panel key={`resp-${isMobile}`} title="响应" collapsible={isMobile} defaultOpen={!isMobile}>
                            <div className="grid grid-cols-3 gap-2">
                                {(["stable", "standard", "sensitive"] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setResponseMode(item)}
                                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${responseMode === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                                    >
                                        {RESPONSE_LABELS[item].label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] leading-snug text-slate-400">
                                {RESPONSE_LABELS[responseMode].hint}
                            </p>
                        </Panel>

                        <Panel
                            key={`metro-${isMobile}`}
                            icon={<Timer className="h-4 w-4 text-emerald-700" />}
                            title="节拍器"
                            collapsible={isMobile}
                            defaultOpen={!isMobile}
                            action={(
                                <button
                                    type="button"
                                    onClick={toggleMetronome}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] ${metronomeOn ? "bg-zinc-800 hover:bg-zinc-950" : "bg-emerald-700 hover:bg-emerald-800"}`}
                                >
                                    {metronomeOn ? "停止" : "启动"}
                                </button>
                            )}
                        >
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => nudgeBpm(-1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                                    aria-label="降低速度"
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                                <div className="text-center">
                                    <div className="text-4xl font-black tabular-nums text-slate-950">{bpm}</div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">BPM</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => nudgeBpm(1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                                    aria-label="提高速度"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>

                            <input
                                type="range"
                                min={MIN_BPM}
                                max={MAX_BPM}
                                value={bpm}
                                onChange={(event) => setBpm(clampBpm(Number(event.target.value)))}
                                className="mt-3 w-full accent-emerald-700"
                            />

                            <div className="mt-3 flex items-center justify-center gap-1.5">
                                {Array.from({ length: beatsPerBar }).map((_, index) => (
                                    <span
                                        key={index}
                                        className={`h-2.5 w-2.5 rounded-full transition ${
                                            metronomeOn && activeBeat === index
                                                ? index === 0 ? "scale-125 bg-emerald-600" : "scale-125 bg-slate-700"
                                                : index === 0 ? "bg-emerald-200" : "bg-slate-200"
                                        }`}
                                    />
                                ))}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-500">拍号</span>
                                <div className="flex gap-1">
                                    {[2, 3, 4, 6].map((beats) => (
                                        <button
                                            key={beats}
                                            type="button"
                                            onClick={() => setBeatsPerBar(beats)}
                                            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${beatsPerBar === beats ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                        >
                                            {beats}/4
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                                <Volume2 className="h-4 w-4 text-slate-400" />
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(metronomeVolume * 100)}
                                    onChange={(event) => setMetronomeVolume(Number(event.target.value) / 100)}
                                    className="w-full accent-slate-700"
                                />
                            </div>
                            <p className="mt-2 text-[11px] leading-snug text-slate-400">
                                节拍声会在拾取窗口内被自动屏蔽，不影响音准识别。
                            </p>
                        </Panel>

                        {isMobile && (
                            <button
                                type="button"
                                onClick={() => setStatsModalOpen(true)}
                                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white/78 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-white"
                            >
                                <span className="flex items-center gap-2">
                                    <BarChart3 className="h-4 w-4 text-emerald-700" />
                                    音准统计
                                </span>
                                <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                    {statsEnabled && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                                    {totalNotes > 0 && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{totalOut}/{totalNotes}</span>
                                    )}
                                    <ChevronDown className="h-4 w-4 -rotate-90 text-slate-400" />
                                </span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={resetSamples}
                            className="w-full rounded-lg border border-slate-200 bg-white/78 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                        >
                            清空轨迹
                        </button>
                    </aside>
                </section>
            </main>

            {isMobile && statsModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
                    onClick={() => setStatsModalOpen(false)}
                >
                    <div
                        className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                <BarChart3 className="h-4 w-4 text-emerald-700" />
                                音准统计
                            </div>
                            <div className="flex items-center gap-2">
                                {statsToggle}
                                <button
                                    type="button"
                                    onClick={() => setStatsModalOpen(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                                    aria-label="关闭统计"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        {statsBody}
                    </div>
                </div>
            )}
        </div>
    );
}
