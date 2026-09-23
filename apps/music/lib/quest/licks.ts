/**
 * Procedural lick generation.
 *
 * The product lives or dies on content volume, and hand-authoring hundreds of
 * exercises does not scale for a solo side project. So prompts are generated,
 * not written -- but generated under enough musical constraint that they sound
 * like *music* rather than like a random-note generator. That distinction is the
 * difference between a user practising and a user quitting.
 *
 * Constraints applied (see `generateLick`):
 *   - notes are drawn from a real scale, not the chromatic soup;
 *   - motion is predominantly stepwise, with leaps used sparingly;
 *   - a leap is resolved by step in the opposite direction, per common-practice
 *     voice leading;
 *   - the phrase begins and ends on a stable scale degree;
 *   - every note is physically reachable within the world's position limit.
 *
 * Generation is fully deterministic given a seed, which matters for two reasons:
 * a lick ID can be stored as an integer instead of a blob, and the weekly
 * challenge can hand every player the identical prompt.
 *
 * NOTE: The TypeScript and Python generators produce DIFFERENT licks for the
 * same seed, by necessity, because they use different PRNG algorithms
 * (Python uses Mersenne Twister, which cannot be faithfully reproduced here).
 * The parity harness evaluating both engines must feed them identical *lick data*,
 * not identical seeds.
 */

import type { Lick, NoteSpec, WorldSpec } from "./types.ts";
import type { Mode } from "./theory.ts";
import { candidateFingerings, noteName, parseNoteName, scalePitches } from "./theory.ts";

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/**
 * A seeded PRNG using mulberry32.
 * Deterministic and fast, suitable for generating identical licks from seeds.
 */
export class Random {
    private a: number;

    constructor(seed: number) {
        this.a = seed >>> 0;
    }

    /** Returns uniform float in [0, 1) */
    nextFloat(): number {
        this.a |= 0;
        this.a = (this.a + 0x6D2B79F5) | 0;
        let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Integer in [min, max] inclusive */
    randint(min: number, max: number): number {
        return Math.floor(this.nextFloat() * (max - min + 1)) + min;
    }

    /** Uniform float in [min, max) */
    uniform(min: number, max: number): number {
        return this.nextFloat() * (max - min) + min;
    }

    /** Draw one element uniformly */
    choice<T>(seq: readonly T[]): T {
        if (seq.length === 0) throw new Error("Cannot choose from empty array");
        return seq[this.randint(0, seq.length - 1)]!;
    }

    /** Draw one element with weights */
    choices<T>(seq: readonly T[], weights: readonly number[]): T {
        if (seq.length === 0 || seq.length !== weights.length) {
            throw new Error("Invalid sequence or weights");
        }
        let total = 0;
        for (let i = 0; i < weights.length; i++) total += weights[i]!;

        let r = this.uniform(0, total);
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i]!;
            if (r <= 0) return seq[i]!;
        }
        return seq[seq.length - 1]!;
    }
}

function hashSeedAndWorld(seed: number, world: number): number {
    let h = 0x811C9DC5;
    h = Math.imul(h ^ seed, 0x01000193);
    h = Math.imul(h ^ world, 0x01000193);
    return h >>> 0;
}

// ---------------------------------------------------------------------------
// World (difficulty tier) definitions
// ---------------------------------------------------------------------------

export const WORLDS: Record<number, WorldSpec> = {
    1: {
        index: 1,
        name: "摸索 / Groping",
        blurb: "One position, stepwise motion. Build the hear-it-then-find-it reflex.",
        numNotes: [2, 3],
        allowedIntervals: [1, 2],
        modes: ["major"],
        tonicChoices: [parseNoteName("D4")],
        midiRange: [62, 71],
        maxPosition: 1,
        allowTransposition: false,
        useRhythm: false,
        tempoRange: [60.0, 72.0],
    },
    2: {
        index: 2,
        name: "跳进 / Leaps",
        blurb: "Thirds, fourths and fifths enter. Interval recognition proper.",
        numNotes: [3, 5],
        allowedIntervals: [1, 2, 3, 4, 5, 7],
        modes: ["major", "natural_minor"],
        tonicChoices: [
            parseNoteName("D4"),
            parseNoteName("A4"),
        ],
        midiRange: [62, 76],
        maxPosition: 1,
        allowTransposition: false,
        useRhythm: false,
        tempoRange: [66.0, 92.0],
    },
    3: {
        index: 3,
        name: "节奏 / Rhythm",
        blurb: "Pitch and rhythm must be tracked independently.",
        numNotes: [5, 8],
        allowedIntervals: [1, 2, 3, 4, 5, 7],
        modes: ["major", "natural_minor", "mixolydian"],
        tonicChoices: [
            parseNoteName("D4"),
            parseNoteName("A4"),
            parseNoteName("G4"),
        ],
        midiRange: [62, 76],
        maxPosition: 1,
        allowTransposition: false,
        useRhythm: true,
        tempoRange: [66.0, 92.0],
    },
    4: {
        index: 4,
        name: "转调 / Transposition",
        blurb: "Prompts arrive in any key; only the interval shape is graded.",
        numNotes: [5, 8],
        allowedIntervals: [1, 2, 3, 4, 5, 7],
        modes: ["major", "natural_minor", "dorian", "mixolydian"],
        tonicChoices: [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67],
        midiRange: [55, 76],
        maxPosition: 1,
        allowTransposition: true,
        useRhythm: true,
        tempoRange: [66.0, 92.0],
    },
    5: {
        index: 5,
        name: "换把 / Shifting",
        blurb: "The phrase no longer fits in first position.",
        numNotes: [8, 12],
        allowedIntervals: [1, 2, 3, 4, 5, 7, 8, 9, 12],
        modes: ["major", "natural_minor", "harmonic_minor", "dorian"],
        tonicChoices: [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67],
        midiRange: [55, 83],
        maxPosition: 3,
        allowTransposition: true,
        useRhythm: true,
        tempoRange: [72.0, 100.0],
    },
    6: {
        index: 6,
        name: "曲目 / Repertoire",
        blurb: "Full phrases at length. Exercises become music.",
        numNotes: [10, 16],
        allowedIntervals: [1, 2, 3, 4, 5, 7, 8, 9, 12],
        modes: ["major", "natural_minor", "harmonic_minor", "dorian", "mixolydian"],
        tonicChoices: [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67],
        midiRange: [55, 88],
        maxPosition: 5,
        allowTransposition: true,
        useRhythm: true,
        tempoRange: [80.0, 112.0],
    },
};

export function getWorld(index: number): WorldSpec {
    const world = WORLDS[index];
    if (!world) {
        throw new Error(`no world ${index}; available: Object.keys(WORLDS)`);
    }
    return world;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Relative likelihood of each interval size. Stepwise motion dominates; the
 * octave is rare. Sizes absent from a world's allowed set are dropped before
 * sampling, and the remaining weights renormalise.
 */
const INTERVAL_WEIGHT: Record<number, number> = {
    1: 3.0,
    2: 6.0,
    3: 2.5,
    4: 2.0,
    5: 1.5,
    7: 1.0,
    8: 0.4,
    9: 0.4,
    12: 0.3,
};

/**
 * A leap of at least this many semitones should be answered by stepwise motion
 * in the opposite direction.
 */
const LEAP_THRESHOLD = 4;

/** True if `midi` is playable without going above `maxPosition`. */
function reachable(midi: number, maxPosition: number): boolean {
    const fingerings = candidateFingerings(midi);
    for (let i = 0; i < fingerings.length; i++) {
        if (fingerings[i]!.position <= maxPosition) return true;
    }
    return false;
}

function buildPool(spec: WorldSpec, tonicMidi: number, mode: Mode): number[] {
    const lo = spec.midiRange[0]!;
    const hi = spec.midiRange[1]!;
    const pool = scalePitches(tonicMidi, mode, lo, hi);
    const out: number[] = [];
    for (let i = 0; i < pool.length; i++) {
        if (reachable(pool[i]!, spec.maxPosition)) {
            out.push(pool[i]!);
        }
    }
    return out;
}

/** Tonic and dominant pitches -- the notes a phrase can safely rest on. */
function stableDegrees(pool: readonly number[], tonicPc: number): number[] {
    const wanted = new Set([tonicPc % 12, (tonicPc + 7) % 12]);
    const stable: number[] = [];
    for (let i = 0; i < pool.length; i++) {
        const m = pool[i]!;
        if (wanted.has(((m % 12) + 12) % 12)) stable.push(m);
    }
    if (stable.length > 0) return stable;
    return Array.from(pool);
}

/**
 * Durations in beats for `n` notes.
 *
 * Worlds without rhythm get a flat stream of quarter notes so the player can
 * put all their attention on pitch. Once rhythm is unlocked we sample from a
 * small palette and always finish long, which is what makes a phrase sound
 * finished rather than truncated.
 */
function makeRhythm(n: number, spec: WorldSpec, rng: Random): number[] {
    if (!spec.useRhythm) {
        return Array.from({ length: n }, () => 1.0);
    }

    const palette = [0.5, 0.5, 1.0, 1.0, 1.0, 1.5, 2.0];
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
        if (i === n - 1) {
            out.push(rng.choice([1.0, 2.0, 2.0]));
            break;
        }
        let d = rng.choice(palette);
        // A dotted quarter is only idiomatic when followed by an eighth, so
        // pre-commit the pair rather than leaving a limping bar behind.
        if (d === 1.5 && i < n - 2) {
            out.push(1.5, 0.5);
            i += 1;
            continue;
        }
        if (d === 1.5) {
            d = 1.0;
        }
        out.push(d);
    }

    const result = out.slice(0, n);
    while (result.length < n) result.push(1.0);
    return result;
}

/**
 * Pick the next pitch, honouring voice-leading preferences.
 *
 * @param current - The pitch we are moving from.
 * @param pool - Legal pitches for this key/world.
 * @param spec - The world being generated.
 * @param rng - Seeded RNG.
 * @param pendingResolution - -1 or +1 if the previous move was a leap and we owe
 *        a stepwise move in that direction; 0 otherwise.
 * @param recent - Recently used pitches, to damp repetition.
 * @param options.restrictTo - If given, only these pitches may be chosen. Used to force
 *        the final note onto a stable scale degree.
 * @param options.bonusFor - Optional predicate; matching pitches are weighted up. Used to
 *        steer the penultimate note somewhere a resolution is reachable from.
 *
 * @returns The chosen pitch, or null if nothing legal is available.
 */
function chooseNext(
    current: number,
    pool: readonly number[],
    spec: WorldSpec,
    rng: Random,
    pendingResolution: number,
    recent: readonly number[],
    options: {
        restrictTo?: ReadonlySet<number>;
        bonusFor?: (pitch: number) => boolean;
    } = {}
): number | null {
    const candidates: Array<{ pitch: number; weight: number }> = [];

    for (let i = 0; i < pool.length; i++) {
        const p = pool[i]!;
        if (options.restrictTo && !options.restrictTo.has(p)) continue;

        const delta = p - current;
        const size = Math.abs(delta);

        if (size === 0 || !spec.allowedIntervals.includes(size)) continue;

        let w = INTERVAL_WEIGHT[size] ?? 0.5;

        if (pendingResolution !== 0) {
            // Owed a resolution: strongly favour a step in the owed direction.
            if (delta * pendingResolution > 0 && size <= 2) {
                w *= 8.0;
            } else {
                w *= 0.25;
            }
        }

        // Discourage hammering the same note over and over.
        if (
            recent.length >= 2 &&
            (p === recent[recent.length - 1] || p === recent[recent.length - 2])
        ) {
            w *= 0.3;
        } else if (recent.length === 1 && p === recent[0]) {
            w *= 0.3;
        }

        if (options.bonusFor && options.bonusFor(p)) {
            w *= 4.0;
        }

        candidates.push({ pitch: p, weight: w });
    }

    if (candidates.length === 0) return null;

    const pitches = candidates.map((c) => c.pitch);
    const weights = candidates.map((c) => c.weight);
    return rng.choices(pitches, weights);
}

/** Whether any of `targets` is one legal interval away from `origin`. */
function canReach(origin: number, targets: readonly number[], spec: WorldSpec): boolean {
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        if (t !== origin && spec.allowedIntervals.includes(Math.abs(t - origin))) {
            return true;
        }
    }
    return false;
}

/**
 * Build the pitch sequence for one phrase.
 *
 * The ending is *constructed*, not repaired. An earlier version generated
 * freely and then overwrote the last note with a stable one, which could
 * silently emit an interval the world forbids -- a world-1 phrase ending in a
 * seventh leap. Here the final step simply draws from the stable degrees that
 * are a legal interval away, and the penultimate step is biased toward notes
 * from which such a degree exists.
 *
 * Two-note phrases are built backwards from their resolution. With only
 * stepwise motion available, the tonic and dominant are too far apart to be
 * joined, so requiring a stable *start* would make a stable *ending*
 * impossible -- and the ending is what makes a phrase sound like a phrase.
 */
function generatePitches(
    spec: WorldSpec,
    pool: readonly number[],
    stable: readonly number[],
    n: number,
    rng: Random
): number[] {
    const stableSet = new Set(stable);

    if (n === 2) {
        const last = rng.choice(stable);
        const openers: number[] = [];
        for (let i = 0; i < pool.length; i++) {
            const p = pool[i]!;
            if (p !== last && spec.allowedIntervals.includes(Math.abs(p - last))) {
                openers.push(p);
            }
        }

        if (openers.length > 0) {
            const weights = openers.map((p) => INTERVAL_WEIGHT[Math.abs(p - last)] ?? 0.5);
            return [rng.choices(openers, weights), last];
        }
        // No legal neighbour at all: fall through to the generic path.
    }

    const pitches: number[] = [rng.choice(stable)];
    let pending = 0;

    while (pitches.length < n) {
        const remaining = n - pitches.length;
        const current = pitches[pitches.length - 1]!;
        let nxt: number | null = null;

        if (remaining === 1) {
            nxt = chooseNext(current, pool, spec, rng, pending, pitches, { restrictTo: stableSet });
            if (nxt === null) {
                nxt = chooseNext(current, pool, spec, rng, pending, pitches);
            }
        } else if (remaining === 2) {
            nxt = chooseNext(current, pool, spec, rng, pending, pitches, {
                bonusFor: (p) => canReach(p, stable, spec),
            });
        } else {
            nxt = chooseNext(current, pool, spec, rng, pending, pitches);
        }

        if (nxt === null) {
            // Cornered at the edge of the range: step back toward the middle of
            // the pool rather than aborting the phrase.
            const mid = pool[Math.floor(pool.length / 2)]!;
            nxt = mid !== current ? mid : pool[0]!;
        }

        const delta = nxt - current;
        pending = delta >= LEAP_THRESHOLD ? -1 : delta <= -LEAP_THRESHOLD ? 1 : 0;
        pitches.push(nxt);
    }

    return pitches;
}

/**
 * How many times to re-roll a phrase that failed to land on a stable degree.
 * Cheap insurance: generation is microseconds, and an unresolved ending is the
 * difference between a phrase and a fragment.
 */
const MAX_ENDING_ATTEMPTS = 12;

export interface GenerateLickOptions {
    /** Difficulty tier, 1-6. See `WORLDS`. Defaults to 1. */
    world?: number;
    /** RNG seed. Same seed plus same world always yields the same lick. */
    seed?: number;
    /** Override the key centre. */
    tonicMidi?: number;
    /** Override the scale ("major", "dorian", ...). */
    mode?: Mode;
    /** Override the phrase length. */
    numNotes?: number;
    /** Override the tempo. */
    tempoBpm?: number;
}

/**
 * Generate one prompt.
 *
 * @throws `Error` if the world index is unknown, or the constraints are so
 *         tight that no phrase can be built.
 */
export function generateLick(options: GenerateLickOptions = {}): Lick {
    const worldIndex = options.world ?? 1;
    const spec = getWorld(worldIndex);

    let seed = options.seed;
    if (seed === undefined) {
        seed = Math.floor(Math.random() * 2147483648);
    }

    const rng = new Random(hashSeedAndWorld(seed, worldIndex));

    let tonic = options.tonicMidi ?? rng.choice(spec.tonicChoices);
    const chosenMode = options.mode ?? rng.choice(spec.modes);

    if (!spec.allowTransposition && options.tonicMidi === undefined) {
        tonic = spec.tonicChoices.length === 1 ? spec.tonicChoices[0]! : tonic;
    }

    const pool = buildPool(spec, tonic, chosenMode);
    if (pool.length < 2) {
        throw new Error(
            `world ${worldIndex} with tonic ${noteName(tonic)} ${chosenMode} yields too few playable pitches`
        );
    }

    let n = options.numNotes;
    if (n === undefined) {
        n = rng.randint(spec.numNotes[0]!, spec.numNotes[1]!);
    }
    n = Math.max(2, n);

    const stable = stableDegrees(pool, ((tonic % 12) + 12) % 12);

    // Re-roll rather than repair. A phrase that fails to resolve is discarded
    // and regenerated, which keeps the interval contract intact; the previous
    // approach of overwriting the last note could manufacture an interval the
    // world explicitly forbids.
    let pitches = generatePitches(spec, pool, stable, n, rng);
    for (let attempt = 0; attempt < MAX_ENDING_ATTEMPTS - 1; attempt++) {
        if (stable.includes(pitches[pitches.length - 1]!)) {
            break;
        }
        pitches = generatePitches(spec, pool, stable, n, rng);
    }

    const durations = makeRhythm(pitches.length, spec, rng);

    let tempo = options.tempoBpm;
    if (tempo === undefined) {
        tempo = Math.round(rng.uniform(spec.tempoRange[0]!, spec.tempoRange[1]!));
    }

    const notes: NoteSpec[] = [];
    for (let i = 0; i < pitches.length; i++) {
        notes.push({ midi: pitches[i]!, beats: durations[i]! });
    }

    return {
        notes,
        tonicMidi: tonic,
        mode: chosenMode,
        tempoBpm: tempo,
        world: spec.index,
        seed: seed,
    };
}

/**
 * A reproducible batch of prompts, e.g. one world's worth of levels.
 */
export function generateSet(world: number, count: number, startSeed = 0): Lick[] {
    const out: Lick[] = [];
    for (let i = 0; i < count; i++) {
        out.push(generateLick({ world, seed: startSeed + i }));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Serialisation / Parity Helpers
// ---------------------------------------------------------------------------

export function lickToDict(lick: Lick): Record<string, unknown> {
    return {
        notes: lick.notes.map((n) => ({ midi: n.midi, beats: n.beats })),
        tonic_midi: lick.tonicMidi,
        mode: lick.mode,
        tempo_bpm: lick.tempoBpm,
        world: lick.world,
        seed: lick.seed,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lickFromDict(d: any): Lick {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notes: (d.notes as any[]).map((n) => ({
            midi: Number(n.midi),
            beats: Number(n.beats ?? 1.0),
        })),
        tonicMidi: Number(d.tonic_midi),
        mode: d.mode as Mode,
        tempoBpm: Number(d.tempo_bpm),
        world: Number(d.world),
        seed: Number(d.seed),
    };
}
