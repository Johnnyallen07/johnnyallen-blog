/**
 * Key ladder and vocal register placement.
 *
 * Two problems are solved here, and they are the same problem seen from two
 * sides: *which* pitch class is the tonic, and *which octave* that tonic sits
 * in.
 *
 * ## Why the ladder starts at C, not D
 *
 * D major is the violin's home key — two open strings, maximum resonance — so
 * it was the obvious starting point and it was wrong. Chinese music education
 * teaches fixed-do, where D is permanently named "re". An app that prints
 * "Do" under a D creates a direct collision with what the learner was taught,
 * on the very first exercise, at the exact moment they are trying to attach a
 * name to a sound.
 *
 * In C major the two systems agree: C is "do" under both. The collision
 * disappears, and by the time the ladder reaches D the learner has enough
 * movable-do fluency to survive the disagreement.
 *
 * Accidentals then order the rest, because reading difficulty tracks the key
 * signature almost exactly.
 *
 * ## Why register is a first-class concept
 *
 * A baritone cannot sing A4. Folding octaves at *grading* time — which the
 * grader does, and should — hides the mismatch in the score but not in the
 * experience: the learner still hears a prompt they cannot reproduce and has
 * to transpose it in their head before they can answer. That is a separate
 * skill, and not the one being trained.
 *
 * So the register is chosen before the prompt is synthesised. The male voice
 * hears the whole exercise an octave down, and simply sings what it hears.
 */

import type { Mode } from "./theory.ts";

// ---------------------------------------------------------------------------
// voice ranges
// ---------------------------------------------------------------------------

export type VoiceRange = "male" | "female" | "violin";

export interface VoiceRangeSpec {
    id: VoiceRange;
    /** Where the tonic wants to live. The octave chosen is the one nearest this. */
    preferredTonicMidi: number;
    /** Hard bounds. An exercise is transposed by octaves until it fits, if it can. */
    loMidi: number;
    hiMidi: number;
}

/**
 * How far above the tonic an exercise is allowed to reach.
 *
 * A sixth, not an octave. The generators produce four- and five-note phrases
 * that live inside roughly a sixth, and demanding a full octave of headroom
 * would push several keys into registers nobody wants to sing just to satisfy
 * a bound the exercises never use.
 */
export const EXERCISE_SPAN_SEMITONES = 9;

/**
 * Deliberately conservative. These are untrained-comfortable ranges, not
 * trained ranges: a beginner who is straining is listening to their throat
 * rather than to the pitch.
 *
 * Each range is at least `EXERCISE_SPAN_SEMITONES + 11` wide, so that every
 * pitch class has at least one placement with room for a whole exercise above
 * it.
 */
export const VOICE_RANGES: Record<VoiceRange, VoiceRangeSpec> = {
    // Baritone-ish: A2..E4, centred near D3.
    male: { id: "male", preferredTonicMidi: 50, loMidi: 45, hiMidi: 64 },
    // Mezzo-ish: A3..E5, centred near D4 — exactly an octave above the male.
    female: { id: "female", preferredTonicMidi: 62, loMidi: 57, hiMidi: 76 },
    // The instrument, not a voice. Bounded below by the open G string.
    violin: { id: "violin", preferredTonicMidi: 62, loMidi: 55, hiMidi: 79 },
};

/**
 * Chooses the octave for `tonicPc` that best suits `range`.
 *
 * Nearest-to-preferred *among placements that leave room for the exercise*.
 * Proximity alone is not enough: F for a mezzo is nearest at F4, but an
 * exercise reaching a sixth above F4 runs off the top of the range, so the
 * placement has to account for what will be built on top of the tonic rather
 * than for the tonic in isolation.
 *
 * Falls back to plain nearest-to-preferred if nothing fits, which cannot
 * happen for the shipped ranges but would otherwise be a silent crash.
 */
export function placeTonic(tonicPc: number, range: VoiceRange): number {
    const spec = VOICE_RANGES[range];
    const pc = ((tonicPc % 12) + 12) % 12;

    let best = pc;
    let bestDistance = Infinity;
    let fitted = pc;
    let fittedDistance = Infinity;

    for (let midi = pc; midi <= 127; midi += 12) {
        const distance = Math.abs(midi - spec.preferredTonicMidi);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = midi;
        }
        const roomBelow = midi >= spec.loMidi;
        const roomAbove = midi + EXERCISE_SPAN_SEMITONES <= spec.hiMidi;
        if (roomBelow && roomAbove && distance < fittedDistance) {
            fittedDistance = distance;
            fitted = midi;
        }
    }

    return fittedDistance < Infinity ? fitted : best;
}


/**
 * Shifts `midi` by whole octaves until it lands inside the range, if possible.
 *
 * Whole octaves only: any other interval would change which note it is, and
 * the note is the answer.
 */
export function fitToRange(midi: number, range: VoiceRange): number {
    const spec = VOICE_RANGES[range];
    let out = midi;
    while (out < spec.loMidi && out + 12 <= spec.hiMidi) out += 12;
    while (out > spec.hiMidi && out - 12 >= spec.loMidi) out -= 12;
    return out;
}

// ---------------------------------------------------------------------------
// key ladder
// ---------------------------------------------------------------------------

export interface KeyStage {
    /** 1-based rung. Also the unlock order. */
    index: number;
    /** Stable identifier used in progress storage and message keys. */
    id: string;
    tonicPc: number;
    mode: Mode;
    /** Signed: positive is sharps, negative is flats, zero is neither. */
    accidentals: number;
}

/**
 * Ordered by how hard the key is to *read and sing*, which is not the same as
 * how hard it is to play. D major is third despite being the easiest key on
 * the violin, because two sharps is harder to read than none and because "D is
 * Do" is the collision described at the top of this file.
 */
export const KEY_LADDER: readonly KeyStage[] = [
    { index: 1, id: "C", tonicPc: 0, mode: "major", accidentals: 0 },
    { index: 2, id: "G", tonicPc: 7, mode: "major", accidentals: 1 },
    { index: 3, id: "F", tonicPc: 5, mode: "major", accidentals: -1 },
    { index: 4, id: "D", tonicPc: 2, mode: "major", accidentals: 2 },
    // Relative minor of C: no new accidentals, so the only new thing to learn
    // is the sound of the mode itself.
    { index: 5, id: "Am", tonicPc: 9, mode: "natural_minor", accidentals: 0 },
    { index: 6, id: "A", tonicPc: 9, mode: "major", accidentals: 3 },
    { index: 7, id: "Em", tonicPc: 4, mode: "natural_minor", accidentals: 1 },
];

export function keyStageById(id: string): KeyStage {
    const found = KEY_LADDER.find((stage) => stage.id === id);
    if (!found) throw new Error(`unknown key stage: ${id}`);
    return found;
}

export function keyStageByIndex(index: number): KeyStage {
    const found = KEY_LADDER.find((stage) => stage.index === index);
    if (!found) throw new Error(`unknown key stage index: ${index}`);
    return found;
}

/** Accidental names in the order a key signature writes them. */
const SHARP_ORDER = ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯", "B♯"] as const;
const FLAT_ORDER = ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭", "F♭"] as const;

/** The key signature as glyph names, in writing order. */
export function keySignatureOf(stage: KeyStage): readonly string[] {
    if (stage.accidentals > 0) return SHARP_ORDER.slice(0, stage.accidentals);
    if (stage.accidentals < 0) return FLAT_ORDER.slice(0, -stage.accidentals);
    return [];
}

/** True when the key signature is written with flats rather than sharps. */
export function usesFlats(stage: KeyStage): boolean {
    return stage.accidentals < 0;
}

/** The tonic MIDI note for this key in the register that suits `range`. */
export function tonicMidiFor(stage: KeyStage, range: VoiceRange): number {
    return placeTonic(stage.tonicPc, range);
}

/**
 * The octave of a fixed reference pitch (`pc`, C = 0) for `range`.
 *
 * Aimed a little above the preferred tonic rather than at it, so the violin's
 * A lands on A4 — the note every violinist tunes to — instead of A3.
 */
export function referenceMidiFor(pc: number, range: VoiceRange): number {
    const spec = VOICE_RANGES[range];
    const target = spec.preferredTonicMidi + 3;
    const p = ((pc % 12) + 12) % 12;
    let best = p;
    for (let midi = p; midi <= 127; midi += 12) {
        if (Math.abs(midi - target) < Math.abs(best - target)) best = midi;
    }
    return best;
}
