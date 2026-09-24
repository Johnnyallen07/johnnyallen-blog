import test from "node:test";
import assert from "node:assert/strict";

import {
    buildResolutionPaths,
    buildSightGlyphsWithSteppingStones,
    createStaffGlyph,
    generateFoundationRound,
    generateMasteryLoop,
    midiToTrebleStaffStep,
    scaleDegreeOf,
    scoreFoundationAttempt,
} from "./foundation.ts";
import { createInputPitchDetector } from "./pitchtrack.ts";
import { segmentNotes } from "./segment.ts";
import { DEFAULT_SYNTH_CONFIG, renderFoundationPrompt, renderLick } from "./synth.ts";
import { TOLERANCE_VOICE } from "./types.ts";
import { KEY_LADDER, keyStageById } from "./keys.ts";

test("midiToTrebleStaffStep places E4 on bottom line (0), D4 at -1, C4 at -2, and F5 at top line (8)", () => {
    assert.deepEqual(midiToTrebleStaffStep(64), { staffStep: 0, accidental: "" }); // E4
    assert.deepEqual(midiToTrebleStaffStep(62), { staffStep: -1, accidental: "" }); // D4
    assert.deepEqual(midiToTrebleStaffStep(60), { staffStep: -2, accidental: "" }); // C4
    assert.deepEqual(midiToTrebleStaffStep(66), { staffStep: 1, accidental: "♯" }); // F#4
    assert.deepEqual(midiToTrebleStaffStep(77), { staffStep: 8, accidental: "" }); // F5
});

test("midiToTrebleStaffStep spells the same pitch on a different line under flats", () => {
    // MIDI 70 is A♯4 in a sharp key and B♭4 in a flat one. Same sound, one
    // staff position apart — F major must not draw it as A♯.
    assert.deepEqual(midiToTrebleStaffStep(70, false), { staffStep: 3, accidental: "♯" }); // A♯4
    assert.deepEqual(midiToTrebleStaffStep(70, true), { staffStep: 4, accidental: "♭" }); // B♭4
});

test("scaleDegreeOf assigns movable-do solfege and carets in D major", () => {
    const tonic = 62; // D4
    assert.deepEqual(scaleDegreeOf(62, tonic, "major"), { degree: 1, solfege: "Do", degreeCaret: "1̂" });
    assert.deepEqual(scaleDegreeOf(64, tonic, "major"), { degree: 2, solfege: "Re", degreeCaret: "2̂" });
    assert.deepEqual(scaleDegreeOf(66, tonic, "major"), { degree: 3, solfege: "Mi", degreeCaret: "3̂" });
    assert.deepEqual(scaleDegreeOf(69, tonic, "major"), { degree: 5, solfege: "Sol", degreeCaret: "5̂" });
    assert.deepEqual(scaleDegreeOf(73, tonic, "major"), { degree: 7, solfege: "Ti", degreeCaret: "7̂" });
});

test("buildSightGlyphsWithSteppingStones inserts ghost scale notes between leaps", () => {
    const lick = {
        notes: [
            { midi: 62, beats: 1 }, // D4 (1̂)
            { midi: 69, beats: 1 }, // A4 (5̂) — leap of 7 semitones
        ],
        tonicMidi: 62,
        mode: "major",
        tempoBpm: 72,
        world: 2,
        seed: 42,
    };
    const glyphs = buildSightGlyphsWithSteppingStones(lick);
    const fullGlyphs = glyphs.filter(g => g.visibility === "full");
    const ghostGlyphs = glyphs.filter(g => g.visibility === "ghost" && g.isSteppingStone);

    assert.equal(fullGlyphs.length, 2);
    assert.deepEqual(ghostGlyphs.map(g => g.midi), [64, 66, 67]); // E4 (2̂), F#4 (3̂), G4 (4̂)
});

test("buildResolutionPaths constructs functional resolution trajectories back to Tonic", () => {
    const mi = buildResolutionPaths(62, 3, "major");
    assert.deepEqual(mi.paths[0], [66, 64, 62]); // F#4 (Mi) -> E4 (Re) -> D4 (Do)
    assert.equal(mi.gravity, "down");

    const ti = buildResolutionPaths(62, 7, "major");
    assert.deepEqual(ti.paths[0], [73, 74]); // C#5 (Ti) -> D5 (Do)
    assert.equal(ti.gravity, "up");
});

test("octave-invariant voice grading: male baritone/tenor singing 1 octave lower scores 3 stars", () => {
    const round = generateFoundationRound({ stage: "echo", seed: 101 });
    // Create a performance sung 1 octave lower (-12 semitones, e.g. D3..A3 around 146-220 Hz)
    const maleVocalLick = {
        ...round.targetLick,
        notes: round.targetLick.notes.map(n => ({ midi: n.midi - 12, beats: n.beats })),
    };
    const samples = renderLick(maleVocalLick, DEFAULT_SYNTH_CONFIG);
    const detect = createInputPitchDetector("voice");
    const track = detect(samples, DEFAULT_SYNTH_CONFIG.sr);
    const events = segmentNotes(track);
    const { score } = scoreFoundationAttempt(round, events, { tolerance: TOLERANCE_VOICE });

    assert.equal(score.sequence, 1.0);
    assert.equal(score.stars, 3);
    assert.ok(score.intonation > 0.95);
});

test("Sing-It-Home accepts alternate valid dominant resolution paths (5̂ -> 1̂ or 5̂ -> 6̂ -> 7̂ -> 8̂)", () => {
    const round = generateFoundationRound({ stage: "home", rung: 1, seed: 1 });
    // Ensure we test degree 5̂ (Sol = A4 = 69 in D major)
    const { paths } = buildResolutionPaths(62, 5, "major");
    assert.ok(paths.length >= 2);

    // Synthesize the upper-tetrachord resolution path [69, 71, 73, 74] (Sol -> La -> Ti -> Do)
    const upperPathLick = {
        ...round.targetLick,
        notes: paths[1].map(midi => ({ midi, beats: 1.0 })),
    };
    const samples = renderLick(upperPathLick, DEFAULT_SYNTH_CONFIG);
    const detect = createInputPitchDetector("auto");
    const events = segmentNotes(detect(samples, DEFAULT_SYNTH_CONFIG.sr));

    const customRound = {
        ...round,
        targetLick: {
            ...round.targetLick,
            notes: paths[0].map(midi => ({ midi, beats: 1.0 })),
        },
        alternateLicks: [upperPathLick],
    };
    const { score } = scoreFoundationAttempt(customRound, events);
    assert.equal(score.sequence, 1.0);
    assert.equal(score.stars, 3);
});

test("generateMasteryLoop creates the 4 progressive stages for a single motif", () => {
    const steps = generateMasteryLoop(77, 2);
    assert.equal(steps.length, 4);
    assert.deepEqual(steps.map(s => s.stage), ["echo", "sight", "home", "fill"]);
    assert.deepEqual(steps.map(s => s.loopStep), [1, 2, 3, 4]);

    // Verify prompt synthesis works for all modes
    for (const s of steps) {
        const audio = renderFoundationPrompt({
            tonicMidi: s.tonicMidi,
            mode: s.mode,
            cueMidi: s.cueMidi,
            targetLick: s.targetLick,
            promptAudioMode: s.promptAudioMode,
            withDrone: s.stage === "echo",
        });
        assert.ok(audio.length > 48000);
    }
});

test("rounds default to C major, not the violin-friendly D that fixed-do learners misread", () => {
    const round = generateFoundationRound({ stage: "echo", seed: 5 });
    assert.equal(round.keyId, "C");
    assert.equal(round.tonicMidi % 12, 0);
    assert.deepEqual(round.keySignature, []);
    assert.equal(round.flats, false);
    // The tonic must be printed as Do, which is the whole point of starting here.
    const tonicGlyph = round.revealedGlyphs.find(g => g.midi % 12 === 0);
    if (tonicGlyph) assert.equal(tonicGlyph.solfege, "Do");
});

test("the male register is exactly one octave below the female one", () => {
    for (const key of KEY_LADDER) {
        const male = generateFoundationRound({ stage: "echo", seed: 11, key, voice: "male" });
        const female = generateFoundationRound({ stage: "echo", seed: 11, key, voice: "female" });
        assert.equal(
            female.tonicMidi - male.tonicMidi,
            12,
            `${key.id}: male ${male.tonicMidi} vs female ${female.tonicMidi}`,
        );
        // And the exercise itself must sit inside what that voice can sing.
        for (const note of male.targetLick.notes) {
            assert.ok(note.midi >= 45 && note.midi <= 64, `${key.id}: male note ${note.midi}`);
        }
    }
});

test("F major spells its accidental as B♭, never A♯", () => {
    const round = generateFoundationRound({
        stage: "echo",
        seed: 3,
        key: keyStageById("F"),
    });
    assert.equal(round.flats, true);
    assert.deepEqual(round.keySignature, ["B♭"]);
    for (const glyph of round.revealedGlyphs) {
        assert.notEqual(glyph.accidental, "♯");
    }
});

test("a minor key names its own third rather than borrowing the major one", () => {
    const round = generateFoundationRound({
        stage: "home",
        rung: 2,
        seed: 2,
        key: keyStageById("Am"),
    });
    assert.equal(round.mode, "natural_minor");
    // A natural minor's 3̂ is C, three semitones above the tonic.
    const third = round.tonicMidi + 3;
    const glyph = createStaffGlyph({
        midi: third,
        beats: 1,
        tonicMidi: round.tonicMidi,
        mode: round.mode,
        targetIndex: 0,
    });
    assert.equal(glyph.degree, 3);
    // And no Chinese prose may reach the formula — it is rendered in /en too.
    assert.ok(!/[\u4e00-\u9fff]/.test(round.resolutionFormula), round.resolutionFormula);
});
