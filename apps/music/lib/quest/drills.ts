/**
 * Tap-to-answer ear-training drills: pitch comparison, interval and chord
 * quality recognition. The MuseScore/Teoria canon, graded instantly and fast
 * enough to string together into combos.
 *
 * Pure and seeded: a question is a function of (drill, level, seed, voice).
 */

import { VOICE_RANGES, type VoiceRange } from "./keys.ts";
import { Random } from "./licks.ts";

export type DrillId = "compare" | "interval" | "chord";

export const DRILL_IDS: readonly DrillId[] = ["compare", "interval", "chord"];

/** Highest level of each drill. */
export const DRILL_MAX_LEVEL: Record<DrillId, number> = { compare: 6, interval: 5, chord: 3 };

/** Consecutive correct answers that promote to the next level. */
export const PROMOTE_AFTER = 5;

export interface DrillEvent {
    midis: number[];
    durS: number;
    gapS?: number;
}

export interface DrillQuestion {
    drill: DrillId;
    level: number;
    seed: number;
    /** Answer ids offered, in display order. */
    choices: string[];
    answer: string;
    /** What to play. Pitches may be fractional (cents) for `compare`. */
    events: DrillEvent[];
    /** Pitches involved, lowest first, for the post-answer reveal. */
    pitches: number[];
}

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

/** Pitch distance by level, in semitones: [min, max]. */
const COMPARE_GAPS: Record<number, readonly [number, number]> = {
    1: [7, 12],
    2: [4, 6],
    3: [2, 3],
    4: [1, 1],
    5: [0.5, 0.5],
    6: [0.25, 0.25],
};

function compare(level: number, rng: Random, voice: VoiceRange, seed: number): DrillQuestion {
    const spec = VOICE_RANGES[voice];
    const [lo, hi] = COMPARE_GAPS[level] ?? COMPARE_GAPS[1]!;
    const offerSame = level >= 3;
    const same = offerSame && rng.nextFloat() < 0.12;
    const gap = same ? 0 : lo === hi ? lo : rng.randint(lo, hi);
    const up = rng.nextFloat() < 0.5;
    const first = rng.randint(spec.loMidi + Math.ceil(gap), spec.hiMidi - Math.ceil(gap));
    const second = up ? first + gap : first - gap;
    return {
        drill: "compare",
        level,
        seed,
        choices: offerSame ? ["lower", "same", "higher"] : ["lower", "higher"],
        answer: same ? "same" : up ? "higher" : "lower",
        events: [
            { midis: [first], durS: 0.7, gapS: 0.25 },
            { midis: [second], durS: 0.7 },
        ],
        pitches: [first, second].sort((a, b) => a - b),
    };
}

// ---------------------------------------------------------------------------
// intervals
// ---------------------------------------------------------------------------

export const INTERVALS: Record<string, number> = {
    m2: 1,
    M2: 2,
    m3: 3,
    M3: 4,
    P4: 5,
    TT: 6,
    P5: 7,
    m6: 8,
    M6: 9,
    m7: 10,
    M7: 11,
    P8: 12,
};

/**
 * Introduced in the order they are easiest to tell apart, not the order they
 * are numbered: octave and fifth are the most consonant and least confusable,
 * seconds and sevenths the hardest.
 */
const INTERVAL_SETS: Record<number, readonly string[]> = {
    1: ["P5", "P8"],
    2: ["P4", "P5", "P8"],
    3: ["m3", "M3", "P4", "P5"],
    4: ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6"],
    5: ["m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7", "P8"],
};

export type IntervalDirection = "up" | "down" | "together";

function interval(level: number, rng: Random, voice: VoiceRange, seed: number): DrillQuestion {
    const spec = VOICE_RANGES[voice];
    const set = INTERVAL_SETS[level] ?? INTERVAL_SETS[1]!;
    const id = rng.choice(set);
    const size = INTERVALS[id]!;
    const directions: IntervalDirection[] = level <= 2 ? ["up"] : level <= 4 ? ["up", "down"] : ["up", "down", "together"];
    const direction = rng.choice(directions);
    const low = rng.randint(spec.loMidi, Math.max(spec.loMidi, spec.hiMidi - size));
    const high = low + size;
    const events: DrillEvent[] =
        direction === "together"
            ? [{ midis: [low, high], durS: 1.3 }]
            : direction === "up"
                ? [{ midis: [low], durS: 0.65, gapS: 0.05 }, { midis: [high], durS: 0.9 }]
                : [{ midis: [high], durS: 0.65, gapS: 0.05 }, { midis: [low], durS: 0.9 }];
    return { drill: "interval", level, seed, choices: [...set], answer: id, events, pitches: [low, high] };
}

// ---------------------------------------------------------------------------
// chords
// ---------------------------------------------------------------------------

export const CHORDS: Record<string, readonly number[]> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    diminished: [0, 3, 6],
    augmented: [0, 4, 8],
};

const CHORD_SETS: Record<number, readonly string[]> = {
    1: ["major", "minor"],
    2: ["major", "minor", "diminished"],
    3: ["major", "minor", "diminished", "augmented"],
};

function chord(level: number, rng: Random, voice: VoiceRange, seed: number): DrillQuestion {
    const spec = VOICE_RANGES[voice];
    const set = CHORD_SETS[level] ?? CHORD_SETS[1]!;
    const id = rng.choice(set);
    const root = rng.randint(spec.loMidi, spec.hiMidi - 8);
    const pitches = CHORDS[id]!.map(i => root + i);
    // Broken first so each note can be heard, then struck together for the colour.
    const events: DrillEvent[] = [
        ...pitches.map(m => ({ midis: [m], durS: 0.42, gapS: 0.03 })),
        { midis: pitches, durS: 1.3 },
    ];
    return { drill: "chord", level, seed, choices: [...set], answer: id, events, pitches };
}

export function generateDrill(options: { drill: DrillId; level: number; seed?: number; voice?: VoiceRange }): DrillQuestion {
    const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    const level = Math.max(1, Math.min(DRILL_MAX_LEVEL[options.drill], Math.round(options.level)));
    const voice = options.voice ?? "violin";
    const rng = new Random(seed);
    if (options.drill === "compare") return compare(level, rng, voice, seed);
    if (options.drill === "interval") return interval(level, rng, voice, seed);
    return chord(level, rng, voice, seed);
}

/** Level bookkeeping after one answer: promote after a clean run. */
export function advanceDrill(
    state: { level: number; run: number },
    drill: DrillId,
    correct: boolean,
): { level: number; run: number; promoted: boolean } {
    if (!correct) return { level: state.level, run: 0, promoted: false };
    const run = state.run + 1;
    if (run >= PROMOTE_AFTER && state.level < DRILL_MAX_LEVEL[drill]) {
        return { level: state.level + 1, run: 0, promoted: true };
    }
    return { level: state.level, run, promoted: false };
}
