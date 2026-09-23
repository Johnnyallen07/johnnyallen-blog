/**
 * Shared data structures for the Fiddle Quest engine.
 *
 * These are the contract between modules. Keeping them in one file means a
 * change to a shape is visible as a change to this file, rather than hiding
 * inside whichever module happened to declare it first.
 *
 * Like every other file under `lib/quest/`, this must not import the DOM, Web
 * Audio, or `node:fs`.
 *
 * Ported from the Python reference implementation. Naming follows TypeScript
 * convention (camelCase) rather than transliterating Python's snake_case, but
 * the fields correspond one-to-one so the parity harness can map between them.
 */

import type { Fingering, Mode, Temperament } from "./theory.ts";

// ---------------------------------------------------------------------------
// licks
// ---------------------------------------------------------------------------

/** One note of a target phrase: a pitch and how long it is held, in beats. */
export interface NoteSpec {
    midi: number;
    beats: number;
}

/**
 * A generated phrase to be played to the user and then played back by them.
 *
 * `seed` is retained so any lick can be regenerated exactly — which is what
 * makes the evaluation corpus reproducible and bug reports actionable.
 */
export interface Lick {
    notes: readonly NoteSpec[];
    tonicMidi: number;
    mode: Mode;
    tempoBpm: number;
    world: number;
    seed: number;
}

/** The difficulty envelope for one "world" of the progression. */
export interface WorldSpec {
    index: number;
    name: string;
    blurb: string;
    /** Inclusive [min, max] number of notes. */
    numNotes: readonly [number, number];
    /** Absolute interval sizes in semitones the generator may use. */
    allowedIntervals: readonly number[];
    modes: readonly Mode[];
    /** Candidate tonic MIDI numbers. */
    tonicChoices: readonly number[];
    /** Inclusive [lo, hi] MIDI range. */
    midiRange: readonly [number, number];
    maxPosition: number;
    allowTransposition: boolean;
    useRhythm: boolean;
    /** Inclusive [min, max] tempo. */
    tempoRange: readonly [number, number];
}

// ---------------------------------------------------------------------------
// pitchtrack
// ---------------------------------------------------------------------------

/**
 * Frame-by-frame pitch estimates over a whole clip.
 *
 * Parallel arrays rather than an array of objects: this is a hot path, and
 * every consumer walks the whole thing.
 */
export interface PitchTrack {
    /** Frame centre times in seconds. */
    times: Float64Array;
    /** Fundamental in Hz, or 0 where unvoiced. */
    f0Hz: Float64Array;
    voiced: boolean[];
    /** YIN clarity, 0..1. */
    confidence: Float64Array;
    rms: Float64Array;
    sampleRate: number;
    hopS: number;
}

/**
 * A pitch detector. `YinPitchDetector` satisfies this.
 *
 * This indirection is deliberate: it is the swap point for a CREPE-tiny or
 * SPICE upgrade. Do not bypass it by calling the YIN implementation directly
 * from anything downstream.
 */
export type PitchDetector = (samples: Float32Array, sampleRate: number) => PitchTrack;

// ---------------------------------------------------------------------------
// segment
// ---------------------------------------------------------------------------

/** A note the player actually produced, recovered from the pitch track. */
export interface NoteEvent {
    onsetS: number;
    offsetS: number;
    /** Fractional MIDI: the median over the trimmed stable window. */
    midi: number;
    /** Signed cents from the nearest equal-tempered semitone. */
    centsOffNearest: number;
    confidence: number;
    nFrames: number;
    stableFrames: number;
}

// ---------------------------------------------------------------------------
// align
// ---------------------------------------------------------------------------

export type Op = "match" | "sub" | "del" | "ins";

/**
 * Whether pitches are compared absolutely, or after removing a constant
 * transposition. Relative mode is what lets a player who is uniformly 20 cents
 * sharp — but internally in tune — avoid being punished twice.
 */
export type MatchMode = "absolute" | "relative";

export interface AlignedPair {
    op: Op;
    targetIndex: number | null;
    detectedIndex: number | null;
    deltaSemitones: number | null;
}

export interface Alignment {
    pairs: AlignedPair[];
    cost: number;
    transposeSemitones: number;
    mode: MatchMode;
    nTarget: number;
    nDetected: number;
}

// ---------------------------------------------------------------------------
// hints
// ---------------------------------------------------------------------------

export type HintType =
    | "replay"
    | "slow_75"
    | "slow_50"
    | "isolate_note"
    | "reveal_key"
    | "reveal_first_note"
    | "reveal_rhythm"
    | "reveal_score";

export interface HintSpec {
    tokens: number;
    penalty: number;
    label: string;
    /** When true, taking this hint means the attempt is no longer scored. */
    forfeitsScoring: boolean;
}

export interface HintLedger {
    used: HintType[];
    freeReplaysRemaining: number;
}

export interface TokenWallet {
    balance: number;
    isPro: boolean;
}

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

/** Cents of deviation tolerated before a note counts as out of tune. */
export type Tolerance = 25 | 15 | 8;

export const TOLERANCE_BEGINNER: Tolerance = 25;
export const TOLERANCE_INTERMEDIATE: Tolerance = 15;
export const TOLERANCE_ADVANCED: Tolerance = 8;

export interface NoteScore {
    targetIndex: number;
    targetMidi: number;
    playedMidi: number | null;
    centsError: number | null;
    inTune: boolean;
    op: Op;
    fingering: Fingering | null;
}

// ---------------------------------------------------------------------------
// feedback
// ---------------------------------------------------------------------------

/**
 * One piece of coaching, as data rather than as a sentence.
 *
 * The engine must not contain user-visible prose. The site is bilingual, and a
 * hardcoded Chinese string in the grader would leak into the English locale
 * with no way to catch it. So the grader decides *what* to say and the
 * presentation layer decides how to say it, using `messages/{zh,en}.json`.
 *
 * `truncated` is carried rather than the caller re-deriving it, because the cap
 * is a grading decision — naming twelve wrong notes is not coaching, it is a
 * list.
 */
export type Feedback =
    | { code: "noNotes" }
    | { code: "missedNotes"; count: number }
    | { code: "wrongNotes"; notes: readonly { index: number; expected: string }[]; truncated: boolean }
    | { code: "badlyTuned"; notes: readonly { expected: string; cents: number }[]; truncated: boolean }
    | { code: "extraNotes"; count: number }
    | { code: "openStringDetuned"; strings: readonly string[] }
    | { code: "systematicOffset"; cents: number; sharp: boolean }
    | { code: "worstNote"; note: string; fingering: string | null; cents: number }
    | { code: "rhythmUnsteady" }
    | { code: "clean" };

export interface Score {
    sequence: number;
    intonation: number;
    /** Null when there were too few matched notes to judge rhythm. */
    rhythm: number | null;
    /** Weighted total after the hint penalty is applied. */
    total: number;
    /** Weighted total before the hint penalty. */
    rawTotal: number;
    stars: number;
    alignment: Alignment;
    noteScores: NoteScore[];
    toleranceCents: number;
    tokensSpent: number;
    medianCentsError: number | null;
    feedback: Feedback[];
}


export interface ScoreOptions {
    mode?: MatchMode;
    tolerance?: Tolerance;
    temperament?: Temperament;
    ledger?: HintLedger | null;
    gradeRhythm?: boolean;
}
