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

import { generateLick } from "./licks.ts";
import { scoreAttempt } from "./scoring.ts";
import { SCALE_INTERVALS, type Mode, noteName, scalePitches } from "./theory.ts";
import type { Lick, NoteEvent, NoteSpec, Score, ScoreOptions } from "./types.ts";

export type FoundationStageId = "echo" | "sight" | "home" | "fill";

export type PromptAudioMode =
    | "full_demo"
    | "cadence_and_first_note"
    | "cadence_and_mystery_note";

export type NoteVisibility = "full" | "ghost" | "hidden";

export type GravityDirection = "home" | "down" | "up" | "pillar";

export type HomeRung = 1 | 2 | 3 | 4 | 5 | 6;

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
    tonicMidi: number;
    mode: Mode;
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
 * Maps pitch class (0..11, where C=0) to diatonic letter index (C=0, D=1, E=2, F=3, G=4, A=5, B=6)
 * and accidental under sharp spelling (standard for violin keys G, D, A, E).
 */
const PC_TO_DIATONIC_SHARP: readonly { letter: number; accidental: "♯" | "♭" | "" }[] = [
    { letter: 0, accidental: "" },  // C
    { letter: 0, accidental: "♯" }, // C#
    { letter: 1, accidental: "" },  // D
    { letter: 2, accidental: "♭" }, // Eb
    { letter: 2, accidental: "" },  // E
    { letter: 3, accidental: "" },  // F
    { letter: 3, accidental: "♯" }, // F#
    { letter: 4, accidental: "" },  // G
    { letter: 4, accidental: "♯" }, // G#
    { letter: 5, accidental: "" },  // A
    { letter: 6, accidental: "♭" }, // Bb
    { letter: 6, accidental: "" },  // B
];

/**
 * Computes the treble-clef staff step where E4 (MIDI 64) = 0.
 */
export function midiToTrebleStaffStep(midi: number): { staffStep: number; accidental: "♯" | "♭" | "" } {
    const rounded = Math.round(midi);
    const pc = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    const info = PC_TO_DIATONIC_SHARP[pc]!;
    // E4 is octave 4, letter 2 (E).
    const absoluteDiatonic = octave * 7 + info.letter;
    const e4Diatonic = 4 * 7 + 2; // 30
    return {
        staffStep: absoluteDiatonic - e4Diatonic,
        accidental: info.accidental,
    };
}

/**
 * Returns the key signature sharps count for standard violin keys (C=0, G=1, D=2, A=3, E=4).
 */
export function keySignatureSharps(tonicMidi: number, mode: Mode): readonly string[] {
    const pc = ((tonicMidi % 12) + 12) % 12;
    // Convert minor/modal tonic to relative major pitch class
    const relMajorPc = mode === "natural_minor" || mode === "harmonic_minor"
        ? (pc + 3) % 12
        : mode === "dorian"
            ? (pc + 10) % 12
            : mode === "mixolydian"
                ? (pc + 5) % 12
                : pc;

    switch (relMajorPc) {
        case 7: // G major
            return ["F♯"];
        case 2: // D major
            return ["F♯", "C♯"];
        case 9: // A major
            return ["F♯", "C♯", "G♯"];
        case 4: // E major
            return ["F♯", "C♯", "G♯", "D♯"];
        default:
            return [];
    }
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

export function createStaffGlyph(
    midi: number,
    beats: number,
    tonicMidi: number,
    mode: Mode,
    targetIndex: number,
    visibility: NoteVisibility = "full",
    isSteppingStone = false,
): StaffNoteGlyph {
    const { staffStep, accidental } = midiToTrebleStaffStep(midi);
    const { degree, solfege, degreeCaret } = scaleDegreeOf(midi, tonicMidi, mode);
    return {
        targetIndex,
        midi,
        beats,
        staffStep,
        name: noteName(midi),
        accidental,
        degree,
        solfege,
        degreeCaret,
        visibility,
        isSteppingStone,
    };
}

/**
 * Inserts translucent "Ghost Stepping-Stone" scale notes between melodic leaps
 * (>= 3 semitones) so a sight-singing learner can visually and mentally bridge
 * intervals like 1̂ → 5̂ via (2̂-3̂-4̂).
 */
export function buildSightGlyphsWithSteppingStones(lick: Lick): StaffNoteGlyph[] {
    const scale = scalePitches(lick.tonicMidi, lick.mode, 50, 88);
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
                    out.push(
                        createStaffGlyph(stepMidi, 0.25, lick.tonicMidi, lick.mode, -1, "ghost", true),
                    );
                }
            }
        }
        out.push(createStaffGlyph(cur.midi, cur.beats, lick.tonicMidi, lick.mode, i, "full", false));
    }
    return out;
}

/**
 * Allowed scale degrees (1..7) for each progressive rung of `Sing-It-Home` (0.3).
 */
export const HOME_RUNG_DEGREES: Record<HomeRung, readonly number[]> = {
    1: [1, 5],                // Pillars: Do, Sol
    2: [1, 3, 5],             // Major triad: Do, Mi, Sol
    3: [1, 2, 3, 7],          // Tonic neighbors & leading tone: Do, Re, Mi, Ti
    4: [1, 2, 3, 5, 6],       // Pentatonic: Do, Re, Mi, Sol, La
    5: [1, 2, 3, 4, 5, 6, 7], // Full Diatonic Major
    6: [1, 2, 3, 4, 5, 6, 7], // Natural Minor
};

/**
 * Builds the functional resolution path(s) from a scale degree back to Tonic (`1̂ Do`).
 *
 * Returns `[primaryPath, ...alternatePaths]` as arrays of MIDI pitches.
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

    switch (degree) {
        case 1:
            return {
                paths: [[degPitch(1)]],
                gravity: "home",
                formula: "Do (1̂) — 已在主音归属点",
            };
        case 2:
            return {
                paths: [[degPitch(2), degPitch(1)]],
                gravity: "down",
                formula: "Re (2̂) ↘ Do (1̂)",
            };
        case 3:
            return {
                paths: [[degPitch(3), degPitch(2), degPitch(1)]],
                gravity: "down",
                formula: "Mi (3̂) ↘ Re (2̂) ↘ Do (1̂)",
            };
        case 4:
            return {
                paths: [
                    [degPitch(4), degPitch(3), degPitch(2), degPitch(1)],
                    [degPitch(4), degPitch(3)],
                ],
                gravity: "down",
                formula: "Fa (4̂) ↘ Mi (3̂) ↘ Re (2̂) ↘ Do (1̂)",
            };
        case 5:
            return {
                paths: [
                    [degPitch(5), degPitch(1)],
                    [degPitch(5), degPitch(6), degPitch(7), degPitch(8)],
                    [degPitch(5), degPitch(4), degPitch(3), degPitch(2), degPitch(1)],
                ],
                gravity: "pillar",
                formula: "Sol (5̂) ↘ Do (1̂)  或  Sol (5̂) ↗ La ↗ Ti ↗ Do",
            };
        case 6:
            return {
                paths: [
                    [degPitch(6), degPitch(5), degPitch(1)],
                    [degPitch(6), degPitch(7), degPitch(8)],
                ],
                gravity: "down",
                formula: "La (6̂) ↘ Sol (5̂) ↘ Do (1̂)  或  La (6̂) ↗ Ti ↗ Do",
            };
        case 7:
        default:
            return {
                paths: [
                    [degPitch(7), degPitch(8)],
                    [degPitch(7), degPitch(1)],
                ],
                gravity: "up",
                formula: "Ti (7̂) ↗ Do (1̂)（导音半音上行解决）",
            };
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
 */
export function generateFoundationRound(options: {
    stage: FoundationStageId;
    rung?: HomeRung;
    seed?: number;
    baseLick?: Lick;
    loopStep?: 1 | 2 | 3 | 4;
}): FoundationRound {
    const stage = options.stage;
    const rung: HomeRung = options.rung ?? 2;
    const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
    const mode: Mode = stage === "home" && rung === 6 ? "natural_minor" : "major";
    const tonicMidi = 62; // D4 — violin's most resonant open-string key centre
    const tempoBpm = 68;

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
        const anchorGlyph = createStaffGlyph(tonicMidi, 1.0, tonicMidi, mode, -1, "full", false);
        const hiddenGlyphs = primaryPitches.map((m, i) =>
            createStaffGlyph(m, i === primaryPitches.length - 1 ? 1.5 : 1.0, tonicMidi, mode, i, "hidden", false),
        );
        const revealedGlyphs = [
            anchorGlyph,
            ...primaryPitches.map((m, i) =>
                createStaffGlyph(m, i === primaryPitches.length - 1 ? 1.5 : 1.0, tonicMidi, mode, i, "full", false),
            ),
        ];

        return {
            stage: "home",
            rung,
            seed,
            tonicMidi,
            mode,
            tempoBpm,
            promptAudioMode: "cadence_and_mystery_note",
            cueMidi: primaryPitches[0]!,
            targetLick,
            alternateLicks,
            staffGlyphs: [anchorGlyph, ...hiddenGlyphs],
            revealedGlyphs,
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
        });

    const fullGlyphs = lick.notes.map((n, i) =>
        createStaffGlyph(n.midi, n.beats, lick.tonicMidi, lick.mode, i, "full", false),
    );

    if (stage === "echo") {
        return {
            stage: "echo",
            rung,
            seed,
            tonicMidi: lick.tonicMidi,
            mode: lick.mode,
            tempoBpm: lick.tempoBpm,
            promptAudioMode: "full_demo",
            cueMidi: lick.notes[0]!.midi,
            targetLick: lick,
            alternateLicks: [],
            staffGlyphs: fullGlyphs,
            revealedGlyphs: fullGlyphs,
            gravity: "home",
            resolutionFormula: fullGlyphs.map(g => `${g.solfege}(${g.degreeCaret})`).join(" → "),
            loopStep: options.loopStep,
        };
    }

    if (stage === "sight") {
        const sightGlyphs = buildSightGlyphsWithSteppingStones(lick);
        return {
            stage: "sight",
            rung,
            seed,
            tonicMidi: lick.tonicMidi,
            mode: lick.mode,
            tempoBpm: lick.tempoBpm,
            promptAudioMode: "cadence_and_first_note",
            cueMidi: lick.notes[0]!.midi,
            targetLick: lick,
            alternateLicks: [],
            staffGlyphs: sightGlyphs,
            revealedGlyphs: fullGlyphs,
            gravity: "home",
            resolutionFormula: fullGlyphs.map(g => `${g.solfege}(${g.degreeCaret})`).join(" → "),
            loopStep: options.loopStep,
        };
    }

    // stage === "fill" (First half visible for sight-singing, second half masked as `?` for ear training)
    const visibleCount = Math.max(1, Math.floor(lick.notes.length / 2));
    const fillGlyphs = lick.notes.map((n, i) =>
        createStaffGlyph(
            n.midi,
            n.beats,
            lick.tonicMidi,
            lick.mode,
            i,
            i < visibleCount ? "full" : "hidden",
            false,
        ),
    );

    return {
        stage: "fill",
        rung,
        seed,
        tonicMidi: lick.tonicMidi,
        mode: lick.mode,
        tempoBpm: lick.tempoBpm,
        promptAudioMode: "full_demo",
        cueMidi: lick.notes[0]!.midi,
        targetLick: lick,
        alternateLicks: [],
        staffGlyphs: fillGlyphs,
        revealedGlyphs: fullGlyphs,
        gravity: "home",
        resolutionFormula: fullGlyphs.map(g => `${g.solfege}(${g.degreeCaret})`).join(" → "),
        loopStep: options.loopStep,
    };
}

/**
 * Generates the 4-Stage Mastery Loop (`四幕渐进消隐`) for a single motif seed:
 *   Step 1: 看谱模唱 (`echo`)
 *   Step 2: 阶梯视唱 (`sight`)
 *   Step 3: 核心骨干音归家 (`home`)
 *   Step 4: 残谱/盲听终极实战 (`fill`)
 */
export function generateMasteryLoop(seed: number, rung: HomeRung = 2): readonly FoundationRound[] {
    const baseLick = generateLick({
        world: 2,
        seed,
        tonicMidi: 62,
        mode: "major",
        numNotes: 4,
        tempoBpm: 68,
    });
    return [
        generateFoundationRound({ stage: "echo", rung, seed, baseLick, loopStep: 1 }),
        generateFoundationRound({ stage: "sight", rung, seed, baseLick, loopStep: 2 }),
        generateFoundationRound({ stage: "home", rung, seed: seed + 7, loopStep: 3 }),
        generateFoundationRound({ stage: "fill", rung, seed, baseLick, loopStep: 4 }),
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
