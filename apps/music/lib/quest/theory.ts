/**
 * Music-theory and violin-fingerboard primitives.
 *
 * Everything downstream (lick generation, scoring, the intonation heatmap)
 * speaks in terms of the types defined here, so this module deliberately has no
 * dependencies at all — not on the DOM, not on Web Audio, not on node:fs. That
 * is what lets the same code run in the browser, under `node --test`, and
 * inside the evaluation harness.
 *
 * Pitch is represented two ways:
 *   - `midi` — float MIDI note number. Fractional values are meaningful; they
 *              carry the intonation information we care about (60.25 is C4
 *              played 25 cents sharp).
 *   - `hz`   — frequency in Hertz.
 *
 * Cents are always *signed*: positive means sharp.
 */

/** Default concert pitch. Configurable because baroque players tune to 415. */
export const DEFAULT_A4_HZ = 440;

/** MIDI note number of A4. */
export const A4_MIDI = 69;

export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Violin open strings, lowest to highest: G3, D4, A4, E5. */
export const OPEN_STRING_MIDI = [55, 62, 69, 76] as const;
export const STRING_NAMES = ["G", "D", "A", "E"] as const;

/**
 * Playable range of the instrument. Used as a hard prior in pitch tracking to
 * suppress octave errors: the violin's harmonic series is strong enough that a
 * naive tracker latches onto 2*f0.
 */
export const VIOLIN_MIN_MIDI = 55; // G3, the open G string
export const VIOLIN_MAX_MIDI = 100; // E7-ish; above this is harmonics territory
export const VIOLIN_MIN_HZ = 190;
export const VIOLIN_MAX_HZ = 2700;

// ---------------------------------------------------------------------------
// Pitch conversions
// ---------------------------------------------------------------------------

/** Convert a (possibly fractional) MIDI note number to Hertz. */
export function midiToHz(midi: number, a4Hz = DEFAULT_A4_HZ): number {
    return a4Hz * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * Convert Hertz to a fractional MIDI note number.
 *
 * Non-positive frequencies map to NaN rather than throwing, because unvoiced
 * frames routinely arrive as 0 from the pitch tracker.
 */
export function hzToMidi(hz: number, a4Hz = DEFAULT_A4_HZ): number {
    if (!(hz > 0)) return Number.NaN;
    return A4_MIDI + 12 * Math.log2(hz / a4Hz);
}

/** Signed cents from `hzB` (reference) to `hzA` (measured). */
export function centsBetween(hzA: number, hzB: number): number {
    if (hzA <= 0 || hzB <= 0) return Number.NaN;
    return 1200 * Math.log2(hzA / hzB);
}

/** Signed cents error of a measured MIDI value against a target. */
export function centsFromMidi(measuredMidi: number, targetMidi: number): number {
    return (measuredMidi - targetMidi) * 100;
}

/** Render a MIDI number as scientific pitch notation, e.g. `A4`. */
export function noteName(midi: number, flats = false): string {
    const m = Math.round(midi);
    const names = flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    // Math.floor, not division truncation: negative MIDI numbers must round down.
    return `${names[((m % 12) + 12) % 12]!}${Math.floor(m / 12) - 1}`;
}

/** Parse `"A4"` / `"C#5"` / `"Bb3"` into a MIDI note number. */
export function parseNoteName(name: string): number {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("empty note name");

    const headLength = trimmed.length > 1 && (trimmed[1] === "#" || trimmed[1] === "b") ? 2 : 1;
    const head = trimmed.slice(0, headLength);
    const octaveStr = trimmed.slice(headLength);
    const normalised = head[0]!.toUpperCase() + head.slice(1);

    let pitchClass = (NOTE_NAMES_SHARP as readonly string[]).indexOf(normalised);
    if (pitchClass < 0) pitchClass = (NOTE_NAMES_FLAT as readonly string[]).indexOf(normalised);
    if (pitchClass < 0) throw new Error(`unrecognised pitch class: ${JSON.stringify(normalised)}`);

    if (!/^-?\d+$/.test(octaveStr)) throw new Error(`bad octave in ${JSON.stringify(name)}`);
    return (Number(octaveStr) + 1) * 12 + pitchClass;
}

// ---------------------------------------------------------------------------
// Temperament
// ---------------------------------------------------------------------------

/**
 * Tuning systems the app can grade against.
 *
 * Being able to switch these — and explain *why* a leading tone wants to be
 * high — is one of the few things a violin-specific trainer can offer that a
 * generic tuner cannot.
 */
export type Temperament = "equal" | "just" | "pythagorean";

/** Cents above the tonic for each of the 12 chromatic degrees. */
const TEMPERAMENT_CENTS: Record<Temperament, readonly number[]> = {
    equal: Array.from({ length: 12 }, (_, i) => 100 * i),
    just: [0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36, 1017.6, 1088.27],
    pythagorean: [0, 113.69, 203.91, 294.13, 407.82, 498.04, 611.73, 701.96, 815.64, 905.87, 996.09, 1109.78],
};

/**
 * Cents to add to the equal-tempered pitch to land in `temperament`.
 *
 * @param midi Target note as an integer MIDI number.
 * @param tonicPc Pitch class (0-11) of the key centre the temperament is built on.
 * @returns A signed cents offset. Always 0 for equal temperament.
 */
export function temperamentOffsetCents(midi: number, tonicPc: number, temperament: Temperament = "equal"): number {
    if (temperament === "equal") return 0;
    const degree = (((Math.trunc(midi) - tonicPc) % 12) + 12) % 12;
    return TEMPERAMENT_CENTS[temperament][degree]! - 100 * degree;
}

/** The target pitch, as fractional MIDI, under a given temperament. */
export function adjustedTargetMidi(midi: number, tonicPc: number, temperament: Temperament = "equal"): number {
    return midi + temperamentOffsetCents(midi, tonicPc, temperament) / 100;
}

// ---------------------------------------------------------------------------
// Fingerboard model
// ---------------------------------------------------------------------------

/**
 * Semitones above the open string at which the *first* finger sits, indexed by
 * position number (1-based). Position 3 puts finger 1 a perfect fourth above
 * the open string, which is the standard reference point.
 */
const POSITION_BASE: Record<number, number> = { 1: 2, 2: 4, 3: 5, 4: 7, 5: 9, 6: 11, 7: 12 };

/**
 * Finger for a given offset from the position base. The hand frame spans a
 * perfect fourth; fingers 2 and 3 each cover two semitones ("low"/"high"
 * placements), which is why this is a range map rather than a simple lookup.
 */
const FINGER_FOR_DELTA: Record<number, number> = { [-1]: 1, 0: 1, 1: 2, 2: 2, 3: 3, 4: 3, 5: 4 };

export const MAX_POSITION = 7;

/**
 * Where a note sits under the hand.
 *
 * This is a *heuristic* reconstruction, not a claim about what the player
 * actually did — we only hear audio, so we cannot know which string was used.
 * It is good enough to drive the per-finger intonation heatmap, which is the
 * only consumer. Treat `stringIndex`/`position` as "most plausible".
 *
 * Known blind spot: in first position the fourth finger plays exactly the pitch
 * of the next open string. Those two are acoustically identical, so no amount
 * of analysis can tell them apart, and `bestFingering` resolves the tie toward
 * the open string. The practical consequence is that the heatmap collects
 * almost no fourth-finger data below the E string's upper register.
 */
export interface Fingering {
    /** 0=G, 1=D, 2=A, 3=E */
    stringIndex: number;
    /** 0 for an open string, else 1..7 */
    position: number;
    /** 0 for an open string, else 1..4 */
    finger: number;
}

export function stringNameOf(fingering: Fingering): string {
    return STRING_NAMES[fingering.stringIndex]!;
}

export function isOpenString(fingering: Fingering): boolean {
    return fingering.finger === 0;
}

export function formatFingering(fingering: Fingering): string {
    if (isOpenString(fingering)) return `${stringNameOf(fingering)}0 (open)`;
    return `${stringNameOf(fingering)}${fingering.position}-${fingering.finger}`;
}

/**
 * Every plausible way to play `midi`, cheapest-first.
 *
 * Ordering preference: open strings, then lowest position, then the highest
 * string that can reach it (beginners stay near first position and favour the
 * brighter strings).
 */
export function candidateFingerings(midi: number): Fingering[] {
    const target = Math.round(midi);
    const out: Fingering[] = [];

    for (let stringIndex = 0; stringIndex < OPEN_STRING_MIDI.length; stringIndex += 1) {
        const n = target - OPEN_STRING_MIDI[stringIndex]!;
        if (n === 0) {
            out.push({ stringIndex, position: 0, finger: 0 });
            continue;
        }
        if (n < 0) continue;

        for (let position = 1; position <= MAX_POSITION; position += 1) {
            const finger = FINGER_FOR_DELTA[n - POSITION_BASE[position]!];
            if (finger !== undefined) out.push({ stringIndex, position, finger });
        }
    }

    out.sort((a, b) => {
        const openA = isOpenString(a) ? 0 : 1;
        const openB = isOpenString(b) ? 0 : 1;
        if (openA !== openB) return openA - openB;
        if (a.position !== b.position) return a.position - b.position;
        return b.stringIndex - a.stringIndex;
    });
    return out;
}

/** The most plausible single fingering for `midi`, or null if unplayable. */
export function bestFingering(midi: number): Fingering | null {
    return candidateFingerings(midi)[0] ?? null;
}

/** Whether the note falls on the violin at all. */
export function playable(midi: number): boolean {
    return candidateFingerings(midi).length > 0;
}

// ---------------------------------------------------------------------------
// Scales and keys
// ---------------------------------------------------------------------------

/** Scale degree patterns as semitone offsets from the tonic. */
export const SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    natural_minor: [0, 2, 3, 5, 7, 8, 10],
    harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    major_pentatonic: [0, 2, 4, 7, 9],
    minor_pentatonic: [0, 3, 5, 7, 10],
} as const satisfies Record<string, readonly number[]>;

export type Mode = keyof typeof SCALE_INTERVALS;

export function isMode(value: string): value is Mode {
    return Object.hasOwn(SCALE_INTERVALS, value);
}

/** All pitches of `mode` rooted at `tonicMidi` within an inclusive range. */
export function scalePitches(tonicMidi: number, mode: Mode, loMidi: number, hiMidi: number): number[] {
    const intervals = SCALE_INTERVALS[mode];
    if (intervals === undefined) {
        throw new Error(`unknown mode ${JSON.stringify(mode)}; known: ${Object.keys(SCALE_INTERVALS).sort().join(", ")}`);
    }
    const tonicPc = ((tonicMidi % 12) + 12) % 12;
    const allowed = new Set(intervals.map((i) => (tonicPc + i) % 12));

    const out: number[] = [];
    for (let m = loMidi; m <= hiMidi; m += 1) {
        if (allowed.has(((m % 12) + 12) % 12)) out.push(m);
    }
    return out;
}

/** Consecutive differences — the transposition-invariant shape of a melody. */
export function intervalsOf(pitches: readonly number[]): number[] {
    const out: number[] = [];
    for (let i = 1; i < pitches.length; i += 1) out.push(pitches[i]! - pitches[i - 1]!);
    return out;
}

export function transpose(pitches: readonly number[], semitones: number): number[] {
    return pitches.map((p) => p + semitones);
}
