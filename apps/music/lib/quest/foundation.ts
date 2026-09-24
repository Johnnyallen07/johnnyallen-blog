/**
 * Foundation Mode (视唱练耳 · 相对音感觉醒) engine.
 *
 * Bridges the gap between "knows how to read standard five-line staff notation"
 * and "can blindly transcribe a melody on the violin" through four progressive
 * pedagogical stages:
 *
 *   1. `echo`  (0.1 看谱模唱): Full staff + audio demo + tonic drone.
 *   2. `sight` (0.2 阶梯视唱): Full staff + ghost stepping-stones on leaps;
 *                              audio plays ONLY cadence + starting reference note.
 *   3. `home`  (0.3 单音归家): Functional ear training (Kodály / Benbassat).
 *                              Audio plays cadence + 1 mystery tone; player sings
 *                              or plays the note AND resolves it home to Tonic (Do).
 *   4. `fill`  (0.4 残谱填空): First half of phrase printed on staff (sight-read),
 *                              second half masked as `?` (ear transcription).
 *
 * Pure functions only — no DOM, no Web Audio, no filesystem.
 */

import {
    type KeyStage,
    keySignatureOf,
    keyStageById,
    tonicMidiFor,
    usesFlats,
    VOICE_RANGES,
    type VoiceRange,
} from "./keys.ts";
import { generateLick } from "./licks.ts";
import { scoreAttempt } from "./scoring.ts";
import { SCALE_INTERVALS, type Mode, noteName, scalePitches } from "./theory.ts";
import type { Lick, NoteEvent, NoteSpec, Score, ScoreOptions } from "./types.ts";

export type FoundationStageId = "echo" | "sight" | "home" | "fill";

/** The pitch-range overrides that keep a generated phrase inside `voice`. */
function lickRangeFor(voice: VoiceRange): { midiRange: readonly [number, number]; requirePlayable: boolean } {
    const spec = VOICE_RANGES[voice];
    return { midiRange: [spec.loMidi, spec.hiMidi], requirePlayable: voice === "violin" };
}

export type PromptAudioMode =
    | "full_demo"
    | "cadence_and_first_note"
    | "cadence_and_mystery_note";

export type NoteVisibility = "full" | "ghost" | "hidden";

export type GravityDirection = "home" | "down" | "up" | "pillar";

export type HomeRung = 1 | 2 | 3 | 4 | 5;

export interface StaffNoteGlyph {
    /** Index in the target Lick (-1 for ungraded ghost stepping-stones). */
    targetIndex: number;
    midi: number;
    beats: number;
    /**
     * Diatonic step on the treble staff relative to E4 (bottom line = 0).
     * Lines are even (0=E4, 2=G4, 4=B4, 6=D5, 8=F5); spaces are odd.
     * C4 (middle C ledger line) is -2; D4 is -1.
     */
    staffStep: number;
    /** Scientific note name e.g. "F#4". */
    name: string;
    /** Accidental to draw only if not already in the key signature. */
    accidental: "♯" | "♭" | "";
    /** 1-based scale degree in the current key (1..7). */
    degree: number;
    /** Movable-do solfège syllable. */
    solfege: string;
    /** Caret notation e.g. "1̂", "3̂", "7̂". */
    degreeCaret: string;
    visibility: NoteVisibility;
    isSteppingStone: boolean;
}

export interface FoundationRound {
    stage: FoundationStageId;
    rung: HomeRung;
    seed: number;
    /** Rung of the key ladder this round was generated from, e.g. `"C"`, `"Am"`. */
    keyId: string;
    tonicMidi: number;
    mode: Mode;
    /** Register the prompt was placed in, so a baritone sings what he hears. */
    voice: VoiceRange;
    /** Accidentals of the key signature, in writing order. */
    keySignature: readonly string[];
    /** True when this key spells its accidentals with flats. */
    flats: boolean;
    tempoBpm: number;
    promptAudioMode: PromptAudioMode;
    /** The single mystery note for `home` stage, or the first note for `sight`. */
    cueMidi: number;
    /** Primary target Lick graded by `scoreFoundationAttempt`. */
    targetLick: Lick;
    /**
     * Alternate valid resolution paths (e.g. dominant 5̂ resolving either down
     * `5̂ → 1̂` or up `5̂ → 6̂ → 7̂ → 1̂`). The grader accepts whichever valid path
     * the player sang or played.
     */
    alternateLicks: readonly Lick[];
    /** Glyphs to render on the five-line staff before the attempt is revealed. */
    staffGlyphs: readonly StaffNoteGlyph[];
    /** Glyphs with all hidden `?` notes revealed (shown after grading). */
    revealedGlyphs: readonly StaffNoteGlyph[];
    /** Gravity direction hint for `home` stage. */
    gravity: GravityDirection;
    /** Human-readable solfège path description e.g. "Mi (3̂) → Re (2̂) → Do (1̂)". */
    resolutionFormula: string;
    /** Optional 1..4 step index when running a 4-Stage Mastery Loop on one motif. */
    loopStep?: 1 | 2 | 3 | 4;
}

const SOLFEGE_BY_DEGREE: readonly string[] = [
    "Do",
    "Re",
    "Mi",
    "Fa",
    "Sol",
    "La",
    "Ti",
];

const CARET_BY_DEGREE: readonly string[] = [
    "1̂",
    "2̂",
    "3̂",
    "4̂",
    "5̂",
    "6̂",
    "7̂",
];

/**
 * Maps pitch class (0..11, C=0) to a diatonic letter index (C=0 … B=6) plus an
 * accidental.
 *
 * Two tables, because a pitch class is not a note. MIDI 70 is B♭ in F major
 * and A♯ in B major; they sound identical and sit on different lines of the
 * staff. Spelling one as the other puts the notehead in the wrong place, which
 * is exactly the thing a reading exercise is trying to teach.
 */
const PC_TO_DIATONIC_SHARP: readonly { letter: number; accidental: "♯" | "♭" | "" }[] = [
    { letter: 0, accidental: "" },  // C
    { letter: 0, accidental: "♯" }, // C♯
    { letter: 1, accidental: "" },  // D
    { letter: 1, accidental: "♯" }, // D♯
    { letter: 2, accidental: "" },  // E
    { letter: 3, accidental: "" },  // F
    { letter: 3, accidental: "♯" }, // F♯
    { letter: 4, accidental: "" },  // G
    { letter: 4, accidental: "♯" }, // G♯
    { letter: 5, accidental: "" },  // A
    { letter: 5, accidental: "♯" }, // A♯
    { letter: 6, accidental: "" },  // B
];

const PC_TO_DIATONIC_FLAT: readonly { letter: number; accidental: "♯" | "♭" | "" }[] = [
    { letter: 0, accidental: "" },  // C
    { letter: 1, accidental: "♭" }, // D♭
    { letter: 1, accidental: "" },  // D
    { letter: 2, accidental: "♭" }, // E♭
    { letter: 2, accidental: "" },  // E
    { letter: 3, accidental: "" },  // F
    { letter: 4, accidental: "♭" }, // G♭
    { letter: 4, accidental: "" },  // G
    { letter: 5, accidental: "♭" }, // A♭
    { letter: 5, accidental: "" },  // A
    { letter: 6, accidental: "♭" }, // B♭
    { letter: 6, accidental: "" },  // B
];

/**
 * Computes the treble-clef staff step where E4 (MIDI 64) = 0.
 */
export function midiToTrebleStaffStep(
    midi: number,
    flats = false,
): { staffStep: number; accidental: "♯" | "♭" | "" } {
    const rounded = Math.round(midi);
    const pc = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    const info = (flats ? PC_TO_DIATONIC_FLAT : PC_TO_DIATONIC_SHARP)[pc]!;
    // E4 is octave 4, letter 2 (E).
    const absoluteDiatonic = octave * 7 + info.letter;
    const e4Diatonic = 4 * 7 + 2; // 30
    return {
        staffStep: absoluteDiatonic - e4Diatonic,
        accidental: info.accidental,
    };
}

/**
 * Determines the 1-based scale degree (1..7) of `midi` relative to `tonicMidi` and `mode`.
 */
export function scaleDegreeOf(midi: number, tonicMidi: number, mode: Mode): {
    degree: number;
    solfege: string;
    degreeCaret: string;
} {
    const intervals = SCALE_INTERVALS[mode] ?? SCALE_INTERVALS.major;
    const semitonesFromTonic = (((Math.round(midi) - Math.round(tonicMidi)) % 12) + 12) % 12;

    let bestIndex = 0;
    let bestDist = 99;
    for (let i = 0; i < intervals.length; i++) {
        const dist = Math.abs(intervals[i]! - semitonesFromTonic);
        if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
        }
    }
    const degree = bestIndex + 1;
    return {
        degree,
        solfege: SOLFEGE_BY_DEGREE[bestIndex] ?? "Do",
        degreeCaret: CARET_BY_DEGREE[bestIndex] ?? "1̂",
    };
}

export interface StaffGlyphOptions {
    midi: number;
    beats: number;
    tonicMidi: number;
    mode: Mode;
    targetIndex: number;
    visibility?: NoteVisibility;
    isSteppingStone?: boolean;
    /** Spell accidentals as flats. Follows the key signature, not the pitch. */
    flats?: boolean;
}

export function createStaffGlyph(options: StaffGlyphOptions): StaffNoteGlyph {
    const flats = options.flats ?? false;
    const { staffStep, accidental } = midiToTrebleStaffStep(options.midi, flats);
    const { degree, solfege, degreeCaret } = scaleDegreeOf(
        options.midi,
        options.tonicMidi,
        options.mode,
    );
    return {
        targetIndex: options.targetIndex,
        midi: options.midi,
        beats: options.beats,
        staffStep,
        name: noteName(options.midi, flats),
        accidental,
        degree,
        solfege,
        degreeCaret,
        visibility: options.visibility ?? "full",
        isSteppingStone: options.isSteppingStone ?? false,
    };
}

/**
 * Inserts translucent "Ghost Stepping-Stone" scale notes between melodic leaps
 * (>= 3 semitones) so a sight-singing learner can visually and mentally bridge
 * intervals like 1̂ → 5̂ via (2̂-3̂-4̂).
 */
export function buildSightGlyphsWithSteppingStones(lick: Lick, flats = false): StaffNoteGlyph[] {
    const scale = scalePitches(lick.tonicMidi, lick.mode, lick.tonicMidi - 12, lick.tonicMidi + 24);
    const out: StaffNoteGlyph[] = [];

    for (let i = 0; i < lick.notes.length; i++) {
        const cur = lick.notes[i]!;
        if (i > 0) {
            const prev = lick.notes[i - 1]!;
            const diff = cur.midi - prev.midi;
            if (Math.abs(diff) >= 3) {
                const lo = Math.min(prev.midi, cur.midi);
                const hi = Math.max(prev.midi, cur.midi);
                const between = scale.filter(m => m > lo && m < hi);
                if (diff < 0) between.reverse();
                for (const stepMidi of between) {
                    out.push(createStaffGlyph({
                        midi: stepMidi,
                        beats: 0.25,
                        tonicMidi: lick.tonicMidi,
                        mode: lick.mode,
                        targetIndex: -1,
                        visibility: "ghost",
                        isSteppingStone: true,
                        flats,
                    }));
                }
            }
        }
        out.push(createStaffGlyph({
            midi: cur.midi,
            beats: cur.beats,
            tonicMidi: lick.tonicMidi,
            mode: lick.mode,
            targetIndex: i,
            flats,
        }));
    }
    return out;
}

/**
 * Allowed scale degrees (1..7) for each progressive rung of `Sing-It-Home` (0.3).
 *
 * There used to be a sixth rung whose only distinction was being minor. Mode
 * now belongs to the key you chose off the ladder, so that rung was an exact
 * duplicate of rung 5 wearing a different label.
 */
export const HOME_RUNG_DEGREES: Record<HomeRung, readonly number[]> = {
    1: [1, 5],                // Pillars: Do, Sol
    2: [1, 3, 5],             // Tonic triad: Do, Mi, Sol
    3: [1, 2, 3, 7],          // Tonic neighbours & leading tone: Do, Re, Mi, Ti
    4: [1, 2, 3, 5, 6],       // Pentatonic: Do, Re, Mi, Sol, La
    5: [1, 2, 3, 4, 5, 6, 7], // Full diatonic
};

/**
 * Builds the functional resolution path(s) from a scale degree back to Tonic (`1̂ Do`).
 *
 * Returns `[primaryPath, ...alternatePaths]` as arrays of MIDI pitches.
 *
 * The formula is *derived from* the paths rather than written out beside them.
 * Two reasons. It was previously half-Chinese, which put user-visible prose
 * inside the engine where `/en` could never reach it. And it named the
 * major-scale syllables unconditionally, so a minor round would print "Mi"
 * over what is actually 3̂ of a minor scale. Reading the syllables back off
 * the pitches makes both failures impossible.
 */
export function buildResolutionPaths(
    tonicMidi: number,
    degree: number,
    mode: Mode = "major",
): {
    paths: number[][];
    gravity: GravityDirection;
    formula: string;
} {
    const intervals = SCALE_INTERVALS[mode] ?? SCALE_INTERVALS.major;
    const degPitch = (d: number): number => {
        if (d <= 7) return tonicMidi + intervals[d - 1]!;
        return tonicMidi + 12; // Upper octave tonic (8̂)
    };

    const describe = (path: readonly number[]): string =>
        path
            .map((midi, i) => {
                const { solfege, degreeCaret } = scaleDegreeOf(midi, tonicMidi, mode);
                const token = `${solfege} (${degreeCaret})`;
                if (i === 0) return token;
                return `${midi > path[i - 1]! ? "↗" : "↘"} ${token}`;
            })
            .join(" ");

    const build = (
        paths: number[][],
        gravity: GravityDirection,
    ): { paths: number[][]; gravity: GravityDirection; formula: string } => ({
        paths,
        gravity,
        // Only the first two paths are shown. The third is a legal answer, not
        // a thing anyone needs to read.
        formula: paths.slice(0, 2).map(describe).join("  ·  "),
    });

    switch (degree) {
        case 1:
            return build([[degPitch(1)]], "home");
        case 2:
            return build([[degPitch(2), degPitch(1)]], "down");
        case 3:
            return build([[degPitch(3), degPitch(2), degPitch(1)]], "down");
        case 4:
            return build(
                [
                    [degPitch(4), degPitch(3), degPitch(2), degPitch(1)],
                    [degPitch(4), degPitch(3)],
                ],
                "down",
            );
        case 5:
            return build(
                [
                    [degPitch(5), degPitch(1)],
                    [degPitch(5), degPitch(6), degPitch(7), degPitch(8)],
                    [degPitch(5), degPitch(4), degPitch(3), degPitch(2), degPitch(1)],
                ],
                "pillar",
            );
        case 6:
            return build(
                [
                    [degPitch(6), degPitch(5), degPitch(1)],
                    [degPitch(6), degPitch(7), degPitch(8)],
                ],
                "down",
            );
        case 7:
        default:
            return build(
                [
                    [degPitch(7), degPitch(8)],
                    [degPitch(7), degPitch(1)],
                ],
                "up",
            );
    }
}

function makeLickFromPitches(
    pitches: readonly number[],
    tonicMidi: number,
    mode: Mode,
    tempoBpm: number,
    seed: number,
): Lick {
    const notes: NoteSpec[] = pitches.map((midi, idx) => ({
        midi,
        beats: idx === pitches.length - 1 ? 1.5 : 1.0,
    }));
    return {
        notes,
        tonicMidi,
        mode,
        tempoBpm,
        world: 1,
        seed,
    };
}

/**
 * Generates a deterministic `FoundationRound` for any of the four pre-requisite stages.
 *
 * The key defaults to the first rung of the ladder (C major) and the register
 * to the violin. Both are explicit rather than implied: the tonic used to be a
 * hardcoded D4, which is simultaneously the wrong pitch class for a fixed-do
 * beginner and the wrong octave for a male voice.
 */
export function generateFoundationRound(options: {
    stage: FoundationStageId;
    rung?: HomeRung;
    seed?: number;
    baseLick?: Lick;
    loopStep?: 1 | 2 | 3 | 4;
    key?: KeyStage;
    voice?: VoiceRange;
}): FoundationRound {
    const stage = options.stage;
    const rung: HomeRung = options.rung ?? 2;
    const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    const key = options.key ?? keyStageById("C");
    const voice: VoiceRange = options.voice ?? "violin";
    const mode: Mode = key.mode;
    const tonicMidi = options.baseLick?.tonicMidi ?? tonicMidiFor(key, voice);
    const flats = usesFlats(key);
    const tempoBpm = 68;

    const keyFields = {
        keyId: key.id,
        voice,
        keySignature: keySignatureOf(key),
        flats,
    };

    if (stage === "home") {
        const degrees = HOME_RUNG_DEGREES[rung];
        // Avoid picking 1̂ every time when higher degrees are unlocked
        const nonTonic = degrees.filter(d => d !== 1);
        const pool = nonTonic.length > 0 && (seed % 5 !== 0) ? nonTonic : degrees;
        const chosenDegree = pool[Math.abs(seed) % pool.length]!;
        const { paths, gravity, formula } = buildResolutionPaths(tonicMidi, chosenDegree, mode);
        const primaryPitches = paths[0]!;
        const targetLick = makeLickFromPitches(primaryPitches, tonicMidi, mode, tempoBpm, seed);
        const alternateLicks = paths
            .slice(1)
            .map((p, i) => makeLickFromPitches(p, tonicMidi, mode, tempoBpm, seed + i + 1));

        // Staff shows Tonic Do anchor on left, then hidden `?` notes for the resolution path
        const anchorGlyph = createStaffGlyph({
            midi: tonicMidi,
            beats: 1.0,
            tonicMidi,
            mode,
            targetIndex: -1,
            flats,
        });
        const pathGlyph = (m: number, i: number, visibility: NoteVisibility): StaffNoteGlyph =>
            createStaffGlyph({
                midi: m,
                beats: i === primaryPitches.length - 1 ? 1.5 : 1.0,
                tonicMidi,
                mode,
                targetIndex: i,
                visibility,
                flats,
            });

        return {
            stage: "home",
            rung,
            seed,
            ...keyFields,
            tonicMidi,
            mode,
            tempoBpm,
            promptAudioMode: "cadence_and_mystery_note",
            cueMidi: primaryPitches[0]!,
            targetLick,
            alternateLicks,
            staffGlyphs: [anchorGlyph, ...primaryPitches.map((m, i) => pathGlyph(m, i, "hidden"))],
            revealedGlyphs: [anchorGlyph, ...primaryPitches.map((m, i) => pathGlyph(m, i, "full"))],
            gravity,
            resolutionFormula: formula,
            loopStep: options.loopStep,
        };
    }

    // For `echo`, `sight`, and `fill`, generate or reuse a melodic Lick
    const lick =
        options.baseLick ??
        generateLick({
            world: stage === "echo" ? 1 : 2,
            seed,
            tonicMidi,
            mode,
            numNotes: stage === "echo" ? 4 : 5,
            tempoBpm,
            ...lickRangeFor(voice),
        });

    const glyphsOf = (visibilityAt: (index: number) => NoteVisibility): StaffNoteGlyph[] =>
        lick.notes.map((n, i) =>
            createStaffGlyph({
                midi: n.midi,
                beats: n.beats,
                tonicMidi: lick.tonicMidi,
                mode: lick.mode,
                targetIndex: i,
                visibility: visibilityAt(i),
                flats,
            }),
        );

    const fullGlyphs = glyphsOf(() => "full");
    const common = {
        rung,
        seed,
        ...keyFields,
        tonicMidi: lick.tonicMidi,
        mode: lick.mode,
        tempoBpm: lick.tempoBpm,
        cueMidi: lick.notes[0]!.midi,
        targetLick: lick,
        alternateLicks: [],
        revealedGlyphs: fullGlyphs,
        gravity: "home" as const,
        resolutionFormula: fullGlyphs.map(g => `${g.solfege} (${g.degreeCaret})`).join(" → "),
        loopStep: options.loopStep,
    };

    if (stage === "echo") {
        return {
            ...common,
            stage: "echo",
            promptAudioMode: "full_demo",
            staffGlyphs: fullGlyphs,
        };
    }

    if (stage === "sight") {
        return {
            ...common,
            stage: "sight",
            promptAudioMode: "cadence_and_first_note",
            staffGlyphs: buildSightGlyphsWithSteppingStones(lick, flats),
        };
    }

    // stage === "fill" (First half visible for sight-singing, second half masked as `?` for ear training)
    const visibleCount = Math.max(1, Math.floor(lick.notes.length / 2));
    return {
        ...common,
        stage: "fill",
        promptAudioMode: "full_demo",
        staffGlyphs: glyphsOf(i => (i < visibleCount ? "full" : "hidden")),
    };
}

/**
 * Generates the 4-Stage Mastery Loop (`四幕渐进消隐`) for a single motif seed:
 *   Step 1: 看谱模唱 (`echo`)
 *   Step 2: 阶梯视唱 (`sight`)
 *   Step 3: 核心骨干音归家 (`home`)
 *   Step 4: 残谱/盲听终极实战 (`fill`)
 */
export function generateMasteryLoop(
    seed: number,
    rung: HomeRung = 2,
    key: KeyStage = keyStageById("C"),
    voice: VoiceRange = "violin",
): readonly FoundationRound[] {
    const baseLick = generateLick({
        world: 2,
        seed,
        tonicMidi: tonicMidiFor(key, voice),
        mode: key.mode,
        numNotes: 4,
        tempoBpm: 68,
        ...lickRangeFor(voice),
    });
    const shared = { rung, key, voice };
    return [
        generateFoundationRound({ ...shared, stage: "echo", seed, baseLick, loopStep: 1 }),
        generateFoundationRound({ ...shared, stage: "sight", seed, baseLick, loopStep: 2 }),
        generateFoundationRound({ ...shared, stage: "home", seed: seed + 7, loopStep: 3 }),
        generateFoundationRound({ ...shared, stage: "fill", seed, baseLick, loopStep: 4 }),
    ];
}

/**
 * Grades a `FoundationRound` attempt. When `alternateLicks` exist (as in `Sing-It-Home`
 * for degrees 4̂, 5̂, 6̂), evaluates all valid tonal resolution paths and returns the
 * highest-scoring match.
 */
export function scoreFoundationAttempt(
    round: FoundationRound,
    events: readonly NoteEvent[],
    options: ScoreOptions = {},
): { score: Score; matchedLick: Lick } {
    const candidates = [round.targetLick, ...round.alternateLicks];
    let bestScore: Score | null = null;
    let bestLick: Lick = round.targetLick;

    for (const candidate of candidates) {
        const current = scoreAttempt(candidate, events, {
            ...options,
            octaveInvariant: options.octaveInvariant ?? true,
        });
        if (!bestScore || current.total > bestScore.total) {
            bestScore = current;
            bestLick = candidate;
        }
    }

    return {
        score: bestScore!,
        matchedLick: bestLick,
    };
}
