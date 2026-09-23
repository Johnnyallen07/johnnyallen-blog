import test from "node:test";
import assert from "node:assert/strict";

import {
    A4_MIDI,
    adjustedTargetMidi,
    bestFingering,
    candidateFingerings,
    centsBetween,
    centsFromMidi,
    hzToMidi,
    intervalsOf,
    isMode,
    midiToHz,
    noteName,
    parseNoteName,
    playable,
    scalePitches,
    temperamentOffsetCents,
    transpose,
    VIOLIN_MAX_MIDI,
    VIOLIN_MIN_MIDI,
} from "./theory.ts";

const closeTo = (actual, expected, tolerance, message) => {
    assert.ok(
        Math.abs(actual - expected) <= tolerance,
        `${message ?? "value"}: expected ${expected} +/- ${tolerance}, got ${actual}`,
    );
};

test("midi and hz round trip across the violin range", () => {
    assert.equal(midiToHz(A4_MIDI), 440);
    assert.equal(hzToMidi(440), A4_MIDI);
    for (let midi = VIOLIN_MIN_MIDI; midi <= VIOLIN_MAX_MIDI; midi += 1) {
        closeTo(hzToMidi(midiToHz(midi)), midi, 1e-9, `midi ${midi}`);
    }
});

test("non-positive frequencies are NaN rather than throwing", () => {
    // Unvoiced frames arrive as 0 from the tracker on every silent hop, so this
    // is the common case, not an error case.
    assert.ok(Number.isNaN(hzToMidi(0)));
    assert.ok(Number.isNaN(hzToMidi(-100)));
    assert.ok(Number.isNaN(centsBetween(0, 440)));
    assert.ok(Number.isNaN(centsBetween(440, 0)));
});

test("cents are signed, with sharp positive", () => {
    closeTo(centsBetween(midiToHz(69.25), midiToHz(69)), 25, 1e-6);
    closeTo(centsBetween(midiToHz(68.75), midiToHz(69)), -25, 1e-6);
    assert.equal(centsFromMidi(60.25, 60), 25);
    closeTo(centsFromMidi(59.7, 60), -30, 1e-9);
});

test("an octave is exactly 1200 cents, which is why grading is octave invariant", () => {
    // This is load-bearing: note identity is compared as pitch class and
    // cents-off-nearest-semitone is identical at every octave, so an octave
    // error in the detector cannot change a grade.
    closeTo(centsBetween(midiToHz(81), midiToHz(69)), 1200, 1e-9);
    for (const midi of [55.3, 62.3, 69.3, 76.3]) {
        const local = centsFromMidi(midi, Math.round(midi));
        const shifted = centsFromMidi(midi + 12, Math.round(midi + 12));
        closeTo(shifted, local, 1e-9, `octave shift of ${midi}`);
    }
});

test("note names use scientific pitch notation", () => {
    assert.equal(noteName(60), "C4");
    assert.equal(noteName(69), "A4");
    assert.equal(noteName(61), "C#4");
    assert.equal(noteName(61, true), "Db4");
    assert.equal(noteName(55), "G3");
    assert.equal(noteName(76), "E5");
    // Rounds to the nearest semitone, so a sharp A4 is still called A4.
    assert.equal(noteName(69.4), "A4");
});

test("note names round trip through the parser", () => {
    for (let midi = 0; midi <= 127; midi += 1) {
        assert.equal(parseNoteName(noteName(midi)), midi, `sharp spelling of ${midi}`);
        assert.equal(parseNoteName(noteName(midi, true)), midi, `flat spelling of ${midi}`);
    }
});

test("the parser rejects nonsense instead of guessing", () => {
    assert.throws(() => parseNoteName(""));
    assert.throws(() => parseNoteName("   "));
    assert.throws(() => parseNoteName("H4"));
    assert.throws(() => parseNoteName("A"));
    assert.throws(() => parseNoteName("Ax4"));
});

test("equal temperament offsets are always zero", () => {
    for (let midi = 55; midi <= 100; midi += 1) {
        assert.equal(temperamentOffsetCents(midi, 2, "equal"), 0);
        assert.equal(adjustedTargetMidi(midi, 2, "equal"), midi);
    }
});

test("just intonation lowers the major third and raises nothing absurdly", () => {
    // Degree 4 (major third) is 386.31 cents rather than 400, so the offset is
    // about -14 cents. This is the number a violinist actually hears when
    // playing a third in a chord.
    closeTo(temperamentOffsetCents(64, 0, "just"), -13.69, 0.01);
    // Degree 7 (perfect fifth) is nearly pure: 701.96 vs 700.
    closeTo(temperamentOffsetCents(67, 0, "just"), 1.96, 0.01);
    // Offsets stay musically plausible everywhere.
    for (let degree = 0; degree < 12; degree += 1) {
        for (const temperament of ["just", "pythagorean"]) {
            const offset = temperamentOffsetCents(60 + degree, 0, temperament);
            assert.ok(Math.abs(offset) < 25, `${temperament} degree ${degree} offset ${offset}`);
        }
    }
});

test("temperament offsets are relative to the tonic, not to C", () => {
    // Transposing the key must transpose the offsets with it.
    for (let tonicPc = 0; tonicPc < 12; tonicPc += 1) {
        const third = 60 + tonicPc + 4;
        closeTo(temperamentOffsetCents(third, tonicPc, "just"), -13.69, 0.01, `tonic ${tonicPc}`);
    }
});

test("open strings are found as open strings", () => {
    for (const [index, midi] of [55, 62, 69, 76].entries()) {
        const fingering = bestFingering(midi);
        assert.deepEqual(fingering, { stringIndex: index, position: 0, finger: 0 });
    }
});

test("fingerings stay on the instrument and inside the hand frame", () => {
    for (let midi = VIOLIN_MIN_MIDI; midi <= VIOLIN_MAX_MIDI; midi += 1) {
        for (const fingering of candidateFingerings(midi)) {
            assert.ok(fingering.stringIndex >= 0 && fingering.stringIndex <= 3);
            assert.ok(fingering.position >= 0 && fingering.position <= 7);
            assert.ok(fingering.finger >= 0 && fingering.finger <= 4);
            if (fingering.finger === 0) assert.equal(fingering.position, 0);
        }
    }
});

test("the fourth finger in first position is invisible, and that is physics", () => {
    // 1st position 4th finger on the D string produces exactly A4, which is the
    // open A string. The two are acoustically identical, so the resolver
    // prefers the open string and the heatmap collects almost no 4th-finger
    // data down here. Documenting it as a test so nobody "fixes" it.
    const fingering = bestFingering(69);
    assert.deepEqual(fingering, { stringIndex: 2, position: 0, finger: 0 });
});

test("notes below the G string are unplayable", () => {
    assert.equal(bestFingering(54), null);
    assert.equal(playable(54), false);
    assert.equal(playable(55), true);
});

test("scales contain only pitches of the mode", () => {
    const dMajor = scalePitches(62, "major", 62, 74);
    assert.deepEqual(dMajor, [62, 64, 66, 67, 69, 71, 73, 74]);

    const aMinorPentatonic = scalePitches(69, "minor_pentatonic", 69, 81);
    for (const pitch of aMinorPentatonic) {
        assert.ok([0, 3, 5, 7, 10].includes(((pitch - 69) % 12 + 12) % 12), `pitch ${pitch}`);
    }
});

test("an unknown mode is rejected rather than silently returning nothing", () => {
    assert.equal(isMode("major"), true);
    assert.equal(isMode("lydian_dominant_bebop"), false);
    assert.throws(() => scalePitches(60, "not_a_mode", 60, 72));
});

test("intervals describe shape, and survive transposition", () => {
    const melody = [62, 64, 66, 67];
    assert.deepEqual(intervalsOf(melody), [2, 2, 1]);
    assert.deepEqual(intervalsOf(transpose(melody, 7)), [2, 2, 1]);
    assert.deepEqual(intervalsOf([]), []);
    assert.deepEqual(intervalsOf([60]), []);
});
