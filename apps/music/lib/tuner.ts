export const CONCERT_A_HZ = 440;

export type TunerMode = "standard" | "strict" | "custom";
export type PitchDeviationTone = "flat" | "center" | "sharp";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const ACCIDENTAL_NOTES = new Set(["C#", "D#", "F#", "G#", "A#"]);

export interface DetectedNote {
    midi: number;
    name: string;
    octave: number;
    label: string;
    targetHz: number;
    frequency: number;
    cents: number;
    hzDelta: number;
}

export interface PianoKey {
    midi: number;
    name: string;
    octave: number;
    label: string;
    frequency: number;
    accidental: boolean;
}

export interface PitchEstimate {
    frequency: number;
    confidence: number;
    rms: number;
}

export interface PianoVoicePartial {
    frequency: number;
    gain: number;
    detuneCents: number;
    decaySeconds: number;
}

export type ResponseMode = "stable" | "standard" | "sensitive";

export const RESPONSE_MODES: ResponseMode[] = ["stable", "standard", "sensitive"];

export interface TrackerConfig {
    /** Minimum YIN clarity (1 - aperiodicity) before a frame is trusted. */
    clarityThreshold: number;
    /** RMS needed to treat the input as "sound present" while idle (onset gate). */
    rmsOn: number;
    /** RMS below which the input is treated as silence while voiced (release gate). */
    rmsOff: number;
    /** EMA weight applied to the median estimate while steadily tracking a note. */
    smoothingAlpha: number;
    /** Deviation (in cents) from the held note that flags a possible new note. */
    jumpCents: number;
    /** How long (ms) a deviating pitch must persist before we snap to it. */
    holdMs: number;
    /** How long (ms) to wait after an onset before recording the trajectory. */
    settleMs: number;
    /** Sustained silence (ms) before the tracker returns to idle. */
    silenceMs: number;
    /** Odd window length used for median outlier rejection. */
    medianWindow: number;
}

export interface RawPitch {
    frequency: number;
    confidence: number;
    rms: number;
    /** Monotonic timestamp in milliseconds. */
    at: number;
    /** Set when the frame overlapped a metronome click and must be ignored. */
    blanked?: boolean;
}

export type TrackerPhase = "idle" | "attack" | "tracking";

export interface TrackerResult {
    phase: TrackerPhase;
    /** Smoothed frequency, or 0 when nothing is being tracked. */
    frequency: number;
    /** True when this frame should be appended to the trajectory. */
    recording: boolean;
    /** True once a settled note is being tracked. */
    voiced: boolean;
    /** True on the frame a brand-new note is accepted. */
    snapped: boolean;
}

export function getTrackerConfig(mode: ResponseMode): TrackerConfig {
    switch (mode) {
        case "stable":
            return {
                clarityThreshold: 0.62,
                rmsOn: 0.02,
                rmsOff: 0.01,
                smoothingAlpha: 0.12,
                jumpCents: 70,
                holdMs: 120,
                settleMs: 75,
                silenceMs: 340,
                medianWindow: 7,
            };
        case "sensitive":
            return {
                clarityThreshold: 0.5,
                rmsOn: 0.013,
                rmsOff: 0.006,
                smoothingAlpha: 0.5,
                jumpCents: 45,
                holdMs: 45,
                settleMs: 35,
                silenceMs: 170,
                medianWindow: 3,
            };
        default:
            return {
                clarityThreshold: 0.56,
                rmsOn: 0.016,
                rmsOff: 0.008,
                smoothingAlpha: 0.28,
                jumpCents: 55,
                holdMs: 70,
                settleMs: 50,
                silenceMs: 240,
                medianWindow: 5,
            };
    }
}

export function medianOfNumbers(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export interface PitchTracker {
    push(raw: RawPitch): TrackerResult;
    reset(): void;
    readonly phase: TrackerPhase;
}

/**
 * Adaptive pitch tracker. It separates three regimes that a fixed smoother
 * cannot tell apart:
 *
 *   - Jitter / timbre changes keep the fundamental within `jumpCents`, so the
 *     readout stays steady (heavy EMA on a median-filtered estimate).
 *   - A genuine new note deviates beyond `jumpCents` AND persists for `holdMs`,
 *     so we snap to it quickly instead of slowly drifting.
 *   - A transient glitch (octave error, attack noise, a stray metronome tick)
 *     deviates beyond `jumpCents` but does NOT persist, so it is discarded and
 *     never recorded into the trajectory.
 *
 * Onsets are held silent for `settleMs` so the noisy attack is not recorded,
 * and a sustained drop below `rmsOff` for `silenceMs` returns the tracker to
 * idle, which is what freezes the trajectory between notes.
 */
export function createPitchTracker(config: TrackerConfig): PitchTracker {
    let phase: TrackerPhase = "idle";
    let smoothed = 0;
    let attackAt = 0;
    let lastVoicedAt = 0;
    let candidateFreq = 0;
    let candidateSince = 0;
    const recent: number[] = [];

    const reset = () => {
        phase = "idle";
        smoothed = 0;
        attackAt = 0;
        candidateFreq = 0;
        candidateSince = 0;
        recent.length = 0;
    };

    const pushRecent = (frequency: number) => {
        recent.push(frequency);
        while (recent.length > config.medianWindow) recent.shift();
    };

    const seedRecent = (frequency: number) => {
        recent.length = 0;
        recent.push(frequency);
    };

    const idle = (voiced: boolean): TrackerResult => ({
        phase,
        frequency: smoothed,
        recording: false,
        voiced,
        snapped: false,
    });

    const push = (raw: RawPitch): TrackerResult => {
        // Metronome-click frames are dropped without disturbing state or timers.
        if (raw.blanked) return idle(phase === "tracking");

        const rmsGate = phase === "idle" ? config.rmsOn : config.rmsOff;
        const trusted = raw.rms >= rmsGate && raw.frequency > 0 && raw.confidence >= config.clarityThreshold;

        if (!trusted) {
            if (phase !== "idle" && raw.at - lastVoicedAt >= config.silenceMs) reset();
            return idle(false);
        }

        lastVoicedAt = raw.at;

        if (phase === "idle") {
            phase = "attack";
            attackAt = raw.at;
            candidateFreq = 0;
            smoothed = raw.frequency;
            seedRecent(raw.frequency);
            return idle(false);
        }

        if (phase === "attack") {
            pushRecent(raw.frequency);
            smoothed = medianOfNumbers(recent);
            if (raw.at - attackAt >= config.settleMs) {
                phase = "tracking";
                return { phase, frequency: smoothed, recording: true, voiced: true, snapped: true };
            }
            return idle(false);
        }

        // phase === "tracking"
        const deviationCents = Math.abs(centsBetween(raw.frequency, smoothed));
        if (deviationCents > config.jumpCents) {
            const continues = candidateFreq > 0 && Math.abs(centsBetween(raw.frequency, candidateFreq)) <= config.jumpCents;
            if (continues) {
                if (raw.at - candidateSince >= config.holdMs) {
                    smoothed = raw.frequency;
                    seedRecent(raw.frequency);
                    candidateFreq = 0;
                    return { phase, frequency: smoothed, recording: true, voiced: true, snapped: true };
                }
            } else {
                candidateFreq = raw.frequency;
                candidateSince = raw.at;
            }
            // Unconfirmed deviation: hold the readout, drop the frame.
            return idle(true);
        }

        candidateFreq = 0;
        pushRecent(raw.frequency);
        smoothed += (medianOfNumbers(recent) - smoothed) * config.smoothingAlpha;
        return { phase, frequency: smoothed, recording: true, voiced: true, snapped: false };
    };

    return {
        push,
        reset,
        get phase() {
            return phase;
        },
    };
}

export function frequencyForMidi(midi: number): number {
    return CONCERT_A_HZ * Math.pow(2, (midi - 69) / 12);
}

export function midiForFrequency(frequency: number): number {
    return 69 + 12 * Math.log2(frequency / CONCERT_A_HZ);
}

export function centsBetween(frequency: number, targetHz: number): number {
    return 1200 * Math.log2(frequency / targetHz);
}

export function formatSignedDecimal(value: number): string {
    if (!Number.isFinite(value)) return "0.0";
    const rounded = Number(value.toFixed(1));
    if (Object.is(rounded, -0)) return "0.0";
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

export function getPitchDeviationTone(hzDelta: number, neutralThresholdHz = 0.05): PitchDeviationTone {
    if (!Number.isFinite(hzDelta) || Math.abs(hzDelta) <= neutralThresholdHz) return "center";
    return hzDelta < 0 ? "flat" : "sharp";
}

export function notePartsForMidi(midi: number): Pick<PianoKey, "name" | "octave" | "label" | "accidental"> {
    const normalizedIndex = ((midi % 12) + 12) % 12;
    const name = NOTE_NAMES[normalizedIndex]!;
    const octave = Math.floor(midi / 12) - 1;
    return {
        name,
        octave,
        label: `${name}${octave}`,
        accidental: ACCIDENTAL_NOTES.has(name),
    };
}

export function noteFromFrequency(frequency: number): DetectedNote {
    const midi = Math.round(midiForFrequency(frequency));
    const targetHz = frequencyForMidi(midi);
    const parts = notePartsForMidi(midi);
    return {
        midi,
        ...parts,
        targetHz,
        frequency,
        cents: centsBetween(frequency, targetHz),
        hzDelta: frequency - targetHz,
    };
}

export function getToleranceHz(mode: TunerMode, customToleranceHz: number): number {
    if (mode === "strict") return 3;
    if (mode === "custom") {
        if (!Number.isFinite(customToleranceHz)) return 10;
        return Math.max(1, Math.min(20, customToleranceHz));
    }
    return 5;
}

export function buildPianoKeys(startMidi = 48, endMidi = 72): PianoKey[] {
    const keys: PianoKey[] = [];
    for (let midi = startMidi; midi <= endMidi; midi += 1) {
        const parts = notePartsForMidi(midi);
        keys.push({
            midi,
            ...parts,
            frequency: frequencyForMidi(midi),
        });
    }
    return keys;
}

export function getPianoVoicePartials(fundamentalHz: number): PianoVoicePartial[] {
    const profile = [
        { ratio: 1, gain: 1, detuneCents: 0, decaySeconds: 2.4 },
        { ratio: 2.003, gain: 0.42, detuneCents: 1.5, decaySeconds: 1.55 },
        { ratio: 3.01, gain: 0.22, detuneCents: -2, decaySeconds: 1.05 },
        { ratio: 4.018, gain: 0.12, detuneCents: 2.5, decaySeconds: 0.78 },
        { ratio: 5.03, gain: 0.075, detuneCents: -1.2, decaySeconds: 0.58 },
        { ratio: 6.044, gain: 0.048, detuneCents: 3, decaySeconds: 0.44 },
        { ratio: 7.07, gain: 0.028, detuneCents: -3.5, decaySeconds: 0.34 },
    ];

    return profile.map((partial) => ({
        frequency: fundamentalHz * partial.ratio,
        gain: partial.gain,
        detuneCents: partial.detuneCents,
        decaySeconds: partial.decaySeconds,
    }));
}

export function estimatePitchFromTimeDomain(
    frame: Float32Array,
    sampleRate: number,
    minFrequency = 65,
    maxFrequency = 2200,
): PitchEstimate {
    let sumSquares = 0;
    for (let index = 0; index < frame.length; index += 1) {
        sumSquares += frame[index]! * frame[index]!;
    }
    const rms = Math.sqrt(sumSquares / frame.length);
    if (rms < 0.012 || frame.length < 64) {
        return { frequency: 0, confidence: 0, rms };
    }

    const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency));
    const maxTau = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(frame.length / 2));
    const yin = new Float32Array(maxTau + 1);

    for (let tau = 1; tau <= maxTau; tau += 1) {
        let difference = 0;
        for (let index = 0; index < maxTau; index += 1) {
            const delta = frame[index]! - frame[index + tau]!;
            difference += delta * delta;
        }
        yin[tau] = difference;
    }

    yin[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        runningSum += yin[tau]!;
        yin[tau] = runningSum === 0 ? 1 : (yin[tau]! * tau) / runningSum;
    }

    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
        if (yin[tau]! < 0.12) {
            while (tau + 1 <= maxTau && yin[tau + 1]! < yin[tau]!) tau += 1;
            tauEstimate = tau;
            break;
        }
    }

    if (tauEstimate === -1) {
        let bestTau = minTau;
        for (let tau = minTau + 1; tau <= maxTau; tau += 1) {
            if (yin[tau]! < yin[bestTau]!) bestTau = tau;
        }
        if (yin[bestTau]! > 0.28) return { frequency: 0, confidence: 0, rms };
        tauEstimate = bestTau;
    }

    const frequency = sampleRate / interpolateTau(yin, tauEstimate);
    if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) {
        return { frequency: 0, confidence: 0, rms };
    }

    return {
        frequency,
        confidence: Math.max(0, Math.min(1, 1 - yin[tauEstimate]!)),
        rms,
    };
}

function interpolateTau(values: Float32Array, tau: number): number {
    const left = values[tau - 1]!;
    const center = values[tau]!;
    const right = values[tau + 1]!;
    const divisor = left + right - 2 * center;
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.000001) return tau;
    return tau + (left - right) / (2 * divisor);
}

export interface NoteVerdict {
    midi: number;
    label: string;
    durationMs: number;
    sampleCount: number;
    medianCents: number;
    medianHzDelta: number;
    toleranceHz: number;
    direction: PitchDeviationTone;
    inTune: boolean;
}

export interface EvaluatorConfig {
    /**
     * How long a note must be held before its intonation is judged. Skipping the
     * first attack/glide and only scoring sustained notes follows how teachers
     * assess intonation — a passing note in a fast run is not a tuning attempt.
     */
    minSustainMs: number;
    /** Minimum frames needed to form a trustworthy median over the hold. */
    minSamples: number;
}

export function getEvaluatorConfig(): EvaluatorConfig {
    return { minSustainMs: 250, minSamples: 4 };
}

export interface EvaluatorFrame {
    at: number;
    recording: boolean;
    midi?: number;
    label?: string;
    cents?: number;
    hzDelta?: number;
    toleranceHz?: number;
}

export interface SustainedNoteEvaluator {
    push(frame: EvaluatorFrame): NoteVerdict | null;
    flush(): NoteVerdict | null;
    reset(): void;
}

/**
 * Groups consecutive recorded frames into sustained notes and, once a note ends
 * (the pitch changes or recording stops), judges its intonation. A note is only
 * scored when it was held for `minSustainMs`; the verdict uses the MEDIAN
 * deviation across the hold, so vibrato — which swings symmetrically around the
 * intended pitch — averages out instead of being flagged as out of tune. In/out
 * of tune is decided against the same green-zone tolerance the player sees.
 */
export function createSustainedNoteEvaluator(config: EvaluatorConfig): SustainedNoteEvaluator {
    let midi = -1;
    let label = "";
    let firstAt = 0;
    let lastAt = 0;
    let toleranceHz = 5;
    const cents: number[] = [];
    const hzDeltas: number[] = [];

    const reset = () => {
        midi = -1;
        label = "";
        cents.length = 0;
        hzDeltas.length = 0;
    };

    const finalize = (): NoteVerdict | null => {
        if (midi < 0) return null;
        const durationMs = lastAt - firstAt;
        const sampleCount = cents.length;
        if (durationMs < config.minSustainMs || sampleCount < config.minSamples) {
            reset();
            return null;
        }
        const medianCents = medianOfNumbers(cents);
        const medianHzDelta = medianOfNumbers(hzDeltas);
        const inTune = Math.abs(medianHzDelta) <= toleranceHz;
        const direction: PitchDeviationTone = inTune
            ? "center"
            : medianHzDelta < 0 ? "flat" : "sharp";
        const verdict: NoteVerdict = {
            midi,
            label,
            durationMs,
            sampleCount,
            medianCents,
            medianHzDelta,
            toleranceHz,
            direction,
            inTune,
        };
        reset();
        return verdict;
    };

    const push = (frame: EvaluatorFrame): NoteVerdict | null => {
        if (!frame.recording || frame.midi === undefined || frame.midi === null) {
            return finalize();
        }

        let verdict: NoteVerdict | null = null;
        if (midi !== frame.midi) {
            verdict = finalize();
            midi = frame.midi;
            label = frame.label ?? notePartsForMidi(frame.midi).label;
            firstAt = frame.at;
        }

        lastAt = frame.at;
        if (typeof frame.cents === "number") cents.push(frame.cents);
        if (typeof frame.hzDelta === "number") hzDeltas.push(frame.hzDelta);
        if (typeof frame.toleranceHz === "number") toleranceHz = frame.toleranceHz;
        return verdict;
    };

    return { push, flush: finalize, reset };
}

export interface CurvePoint {
    x: number;
    y: number;
}

export interface CurveSegment {
    cp1: CurvePoint;
    cp2: CurvePoint;
    end: CurvePoint;
}

function tangentHandle(from: CurvePoint, to: CurvePoint, length: number, tension: number): CurvePoint {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const norm = Math.hypot(dx, dy) || 1;
    const scale = (length * tension) / norm;
    return { x: dx * scale, y: dy * scale };
}

/**
 * Turns a polyline into smooth cubic-Bézier segments (a cardinal / Catmull-Rom
 * style spline). Each control handle points along the local tangent and its
 * length is proportional to that segment's own length, so closely spaced points
 * — e.g. a slow vibrato wobble — bend gently while widely spaced points (a real
 * note change) curve more. Tying the handle to the segment length also stops it
 * from outrunning the segment, which avoids the loops a naïve uniform
 * Catmull-Rom produces on large jumps.
 */
export function smoothPathSegments(points: CurvePoint[], tension = 0.3): CurveSegment[] {
    const count = points.length;
    if (count < 2) return [];

    const segments: CurveSegment[] = [];
    for (let index = 0; index < count - 1; index += 1) {
        const p1 = points[index]!;
        const p2 = points[index + 1]!;
        const p0 = points[index - 1] ?? p1;
        const p3 = points[index + 2] ?? p2;

        const segLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const out = tangentHandle(p0, p2, segLength, tension);
        const incoming = tangentHandle(p1, p3, segLength, tension);

        segments.push({
            cp1: { x: p1.x + out.x, y: p1.y + out.y },
            cp2: { x: p2.x - incoming.x, y: p2.y - incoming.y },
            end: { x: p2.x, y: p2.y },
        });
    }
    return segments;
}
