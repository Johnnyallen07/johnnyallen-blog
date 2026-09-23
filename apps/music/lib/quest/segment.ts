import { medianFilter1d } from "./pitchtrack.ts";
import type { PitchTrack, NoteEvent } from "./types.ts";

export const MIN_NOTE_S = 0.080;
export const ATTACK_TRIM_S = 0.080;
export const RELEASE_TRIM_S = 0.050;
export const PITCH_CHANGE_SEMITONES = 0.6;
export const PITCH_CHANGE_HOLD_S = 0.040;

function stableSlice(start: number, end: number, hopS: number): [number, number] {
    const trimHead = Math.round(ATTACK_TRIM_S / hopS);
    const trimTail = Math.round(RELEASE_TRIM_S / hopS);
    let s = start + trimHead;
    let e = end - trimTail;
    if (e - s < 2) {
        const span = end - start;
        s = start + Math.floor(span / 4);
        e = end - Math.floor(span / 4);
        if (e - s < 1) {
            s = start;
            e = end;
        }
    }
    return [s, e];
}

function runsOfVoiced(voiced: boolean[]): [number, number][] {
    let any = false;
    for (let i = 0; i < voiced.length; i++) {
        if (voiced[i]) {
            any = true;
            break;
        }
    }
    if (!any) return [];

    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i < voiced.length; i++) {
        if (voiced[i] && start === -1) {
            start = i;
        } else if (!voiced[i] && start !== -1) {
            runs.push([start, i]);
            start = -1;
        }
    }
    if (start !== -1) {
        runs.push([start, voiced.length]);
    }
    return runs;
}

function nanMedian(arr: Float64Array): number {
    const valid: number[] = [];
    for (let i = 0; i < arr.length; i++) {
        if (!Number.isNaN(arr[i]!)) valid.push(arr[i]!);
    }
    if (valid.length === 0) return Number.NaN;
    valid.sort((a, b) => a - b);
    const mid = Math.floor(valid.length / 2);
    return valid.length % 2 === 0 ? (valid[mid - 1]! + valid[mid]!) / 2 : valid[mid]!;
}

function splitOnPitchChange(midi: Float64Array, start: number, end: number, hopS: number): [number, number][] {
    const hold = Math.max(2, Math.round(PITCH_CHANGE_HOLD_S / hopS));
    const segments: [number, number][] = [];
    let segStart = start;
    let ref = Number(midi[start]!);
    let deviatingFrom: number | null = null;

    for (let i = start + 1; i < end; i++) {
        const val = Number(midi[i]!);
        if (!Number.isFinite(val)) {
            deviatingFrom = null;
            continue;
        }
        if (Math.abs(val - ref) > PITCH_CHANGE_SEMITONES) {
            if (deviatingFrom === null) {
                deviatingFrom = i;
            } else if (i - deviatingFrom + 1 >= hold) {
                const boundary = deviatingFrom;
                if (boundary - segStart >= 1) {
                    segments.push([segStart, boundary]);
                }
                segStart = boundary;
                ref = nanMedian(midi.subarray(boundary, i + 1));
                deviatingFrom = null;
            }
        } else {
            deviatingFrom = null;
            const windowLen = (i + 1) - segStart;
            if (windowLen >= 3) {
                const startIdx = segStart + Math.floor(windowLen / 3);
                ref = nanMedian(midi.subarray(startIdx, i + 1));
            }
        }
    }

    if (end - segStart >= 1) {
        segments.push([segStart, end]);
    }
    return segments;
}

export interface SegmentNotesOptions {
    minNoteS?: number;
    smoothFrames?: number;
}

export function segmentNotes(track: PitchTrack, opts: SegmentNotesOptions = {}): NoteEvent[] {
    const minNoteS = opts.minNoteS ?? MIN_NOTE_S;
    const smoothFrames = opts.smoothFrames ?? 5;

    if (track.times.length === 0) {
        return [];
    }

    let midi: Float64Array = new Float64Array(track.times.length);
    for (let i = 0; i < track.f0Hz.length; i++) {
        if (track.voiced[i] && track.f0Hz[i]! > 0) {
            midi[i] = 69 + 12 * Math.log2(track.f0Hz[i]! / 440);
        } else {
            midi[i] = Number.NaN;
        }
    }

    if (smoothFrames > 1) {
        midi = medianFilter1d(midi, smoothFrames);
    }

    const voiced = new Array<boolean>(track.times.length);
    for (let i = 0; i < track.times.length; i++) {
        voiced[i] = track.voiced[i]! && Number.isFinite(midi[i]!);
    }

    const hopS = track.hopS;
    const minFrames = Math.max(1, Math.round(minNoteS / hopS));
    const events: NoteEvent[] = [];

    const runs = runsOfVoiced(voiced);
    for (const [runStart, runEnd] of runs) {
        if (runEnd - runStart < minFrames) continue;

        const splits = splitOnPitchChange(midi, runStart, runEnd, hopS);
        for (const [segStart, segEnd] of splits) {
            if (segEnd - segStart < minFrames) continue;

            const [s, e] = stableSlice(segStart, segEnd, hopS);
            const windowArr: number[] = [];
            for (let i = s; i < e; i++) {
                if (Number.isFinite(midi[i]!)) {
                    windowArr.push(midi[i]!);
                }
            }

            if (windowArr.length === 0) continue;

            windowArr.sort((a, b) => a - b);
            const mid = Math.floor(windowArr.length / 2);
            const medianMidi = windowArr.length % 2 === 0 ? (windowArr[mid - 1]! + windowArr[mid]!) / 2 : windowArr[mid]!;
            const nearest = Math.round(medianMidi);

            let sumConf = 0;
            let confCount = 0;
            for (let i = s; i < e; i++) {
                sumConf += track.confidence[i]!;
                confCount++;
            }
            const confidence = confCount > 0 ? sumConf / confCount : 0.0;

            events.push({
                onsetS: track.times[segStart]!,
                offsetS: track.times[segEnd - 1]!,
                midi: medianMidi,
                centsOffNearest: (medianMidi - nearest) * 100.0,
                confidence,
                nFrames: segEnd - segStart,
                stableFrames: windowArr.length,
            });
        }
    }
    return events;
}
