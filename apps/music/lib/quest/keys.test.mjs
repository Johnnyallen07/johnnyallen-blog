import test from "node:test";
import assert from "node:assert/strict";

import {
    EXERCISE_SPAN_SEMITONES,
    KEY_LADDER,
    VOICE_RANGES,
    fitToRange,
    keySignatureOf,
    keyStageById,
    keyStageByIndex,
    placeTonic,
    tonicMidiFor,
    usesFlats,
} from "./keys.ts";
import { scalePitches } from "./theory.ts";

test("the ladder starts at C so fixed-do and movable-do agree", () => {
    assert.equal(KEY_LADDER[0].id, "C");
    assert.equal(KEY_LADDER[0].tonicPc, 0);
    assert.equal(KEY_LADDER[0].accidentals, 0);
});

test("the ladder is ordered, contiguous and uniquely identified", () => {
    const ids = new Set();
    KEY_LADDER.forEach((stage, i) => {
        assert.equal(stage.index, i + 1, "index must match position");
        assert.ok(!ids.has(stage.id), `duplicate id ${stage.id}`);
        ids.add(stage.id);
        assert.ok(stage.tonicPc >= 0 && stage.tonicPc < 12);
    });
});

test("accidental count never jumps by more than one within the same mode", () => {
    // The point of a ladder is that each rung adds one thing.
    const major = KEY_LADDER.filter((s) => s.mode === "major");
    for (let i = 1; i < major.length; i++) {
        const jump = Math.abs(Math.abs(major[i].accidentals) - Math.abs(major[i - 1].accidentals));
        assert.ok(jump <= 1, `${major[i - 1].id} -> ${major[i].id} jumps ${jump} accidentals`);
    }
});

test("key signatures are written in the conventional order", () => {
    assert.deepEqual(keySignatureOf(keyStageById("C")), []);
    assert.deepEqual(keySignatureOf(keyStageById("G")), ["F♯"]);
    assert.deepEqual(keySignatureOf(keyStageById("D")), ["F♯", "C♯"]);
    assert.deepEqual(keySignatureOf(keyStageById("A")), ["F♯", "C♯", "G♯"]);
    assert.deepEqual(keySignatureOf(keyStageById("F")), ["B♭"]);
});

test("F major is spelled with flats and the sharp keys are not", () => {
    assert.equal(usesFlats(keyStageById("F")), true);
    assert.equal(usesFlats(keyStageById("G")), false);
    assert.equal(usesFlats(keyStageById("C")), false);
});

test("the relative minor rung introduces the mode without new accidentals", () => {
    const am = keyStageById("Am");
    assert.equal(am.accidentals, 0);
    assert.equal(am.mode, "natural_minor");
});

test("unknown keys are rejected rather than silently defaulting", () => {
    assert.throws(() => keyStageById("H"));
    assert.throws(() => keyStageByIndex(99));
});

test("a male tonic sits an octave below a female tonic", () => {
    for (const stage of KEY_LADDER) {
        const male = tonicMidiFor(stage, "male");
        const female = tonicMidiFor(stage, "female");
        assert.equal(female - male, 12, `${stage.id}: expected one octave apart`);
    }
});

test("every key places its tonic inside the singer's comfortable range", () => {
    for (const range of ["male", "female", "violin"]) {
        const spec = VOICE_RANGES[range];
        for (const stage of KEY_LADDER) {
            const tonic = tonicMidiFor(stage, range);
            assert.ok(
                tonic >= spec.loMidi && tonic <= spec.hiMidi,
                `${stage.id} in ${range}: tonic ${tonic} outside ${spec.loMidi}..${spec.hiMidi}`,
            );
        }
    }
});

test("a whole exercise from the placed tonic stays singable", () => {
    // This is the property that matters: not just the tonic, the whole exercise.
    for (const range of ["male", "female", "violin"]) {
        const spec = VOICE_RANGES[range];
        for (const stage of KEY_LADDER) {
            const tonic = tonicMidiFor(stage, range);
            const pitches = scalePitches(tonic, stage.mode, tonic, tonic + EXERCISE_SPAN_SEMITONES);
            for (const midi of pitches) {
                assert.ok(
                    midi >= spec.loMidi && midi <= spec.hiMidi,
                    `${stage.id} in ${range}: ${midi} outside ${spec.loMidi}..${spec.hiMidi}`,
                );
            }
        }
    }
});

test("violin exercises stay at or above the open G string", () => {
    for (const stage of KEY_LADDER) {
        const tonic = tonicMidiFor(stage, "violin");
        assert.ok(tonic >= 55, `${stage.id}: tonic ${tonic} is below the open G`);
    }
});

test("placeTonic picks the octave nearest the preferred centre", () => {
    // C for a male voice is C3, not C2 or C4.
    assert.equal(placeTonic(0, "male"), 48);
    assert.equal(placeTonic(0, "female"), 60);
    // G sits an octave apart between the two voices, not at the same pitch.
    assert.equal(placeTonic(7, "male"), 55);
    assert.equal(placeTonic(7, "female"), 67);
});

test("placeTonic is stable under pitch-class aliasing", () => {
    assert.equal(placeTonic(0, "male"), placeTonic(12, "male"));
    assert.equal(placeTonic(2, "female"), placeTonic(-10, "female"));
});

test("fitToRange moves by whole octaves only, so the note never changes", () => {
    const moved = fitToRange(88, "male");
    assert.equal(Math.abs((moved - 88) % 12), 0);
    assert.ok(moved <= VOICE_RANGES.male.hiMidi);
});

test("fitToRange leaves a note that already fits untouched", () => {
    assert.equal(fitToRange(60, "female"), 60);
});

test("fitToRange gives up rather than mangling a note that cannot fit", () => {
    // Nothing to assert about the value beyond octave-equivalence; the point is
    // that it does not loop forever or return something off by a non-octave.
    const out = fitToRange(0, "male");
    assert.equal(Math.abs(out % 12), 0);
});
