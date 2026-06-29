import test from "node:test";
import assert from "node:assert/strict";

import {
    buildPianoKeys,
    centsBetween,
    createPitchTracker,
    createSustainedNoteEvaluator,
    estimatePitchFromTimeDomain,
    formatSignedDecimal,
    frequencyForMidi,
    getEvaluatorConfig,
    getPianoVoicePartials,
    getPitchDeviationTone,
    getToleranceHz,
    getTrackerConfig,
    medianOfNumbers,
    noteFromFrequency,
    smoothPathSegments,
} from "./tuner.ts";

const STD = getTrackerConfig("standard");
const loud = (frequency, at, overrides = {}) => ({
    frequency,
    confidence: 0.9,
    rms: 0.05,
    at,
    ...overrides,
});

test("detects the nearest note with one decimal place pitch offsets", () => {
    const note = noteFromFrequency(880.6);

    assert.equal(note.name, "A");
    assert.equal(note.octave, 5);
    assert.equal(note.label, "A5");
    assert.equal(note.targetHz, 880);
    assert.equal(formatSignedDecimal(note.cents), "+1.2");
    assert.equal(formatSignedDecimal(note.hzDelta), "+0.6");
});

test("uses fixed A4 440Hz tuning for note and keyboard frequencies", () => {
    assert.equal(frequencyForMidi(69), 440);
    assert.equal(frequencyForMidi(72), 523.2511306011972);
    assert.equal(noteFromFrequency(440).label, "A4");
});

test("calculates cents around the nearest target note", () => {
    assert.equal(formatSignedDecimal(centsBetween(442, 440)), "+7.9");
    assert.equal(formatSignedDecimal(centsBetween(438, 440)), "-7.9");
});

test("centers pitch offsets on the nearest sung or played note", () => {
    const c4 = noteFromFrequency(261.9);

    assert.equal(c4.label, "C4");
    assert.equal(formatSignedDecimal(c4.hzDelta), "+0.3");
    assert.ok(Math.abs(c4.hzDelta) < 1);
});

test("classifies pitch deviation direction for canvas feedback", () => {
    assert.equal(getPitchDeviationTone(-0.4), "flat");
    assert.equal(getPitchDeviationTone(0.4), "sharp");
    assert.equal(getPitchDeviationTone(0.02), "center");
    assert.equal(getPitchDeviationTone(Number.NaN), "center");
});

test("maps tuner modes to green-zone tolerances in hertz", () => {
    assert.equal(getToleranceHz("standard", 3), 5);
    assert.equal(getToleranceHz("strict", 12), 3);
    assert.equal(getToleranceHz("custom", 0.2), 1);
    assert.equal(getToleranceHz("custom", 40), 20);
});

test("builds a piano keyboard range for calibration playback", () => {
    const keys = buildPianoKeys(48, 72);

    assert.equal(keys.length, 25);
    assert.deepEqual(keys[0], {
        midi: 48,
        name: "C",
        octave: 3,
        label: "C3",
        frequency: frequencyForMidi(48),
        accidental: false,
    });
    assert.equal(keys.at(-1)?.label, "C5");
    assert.equal(keys.find((key) => key.label === "C#4")?.accidental, true);
});

test("uses a piano voice with multiple decaying partials instead of a single sine", () => {
    const partials = getPianoVoicePartials(440);

    assert.ok(partials.length >= 6);
    assert.equal(partials[0]?.frequency, 440);
    assert.ok(partials[1]?.frequency > 870 && partials[1]?.frequency < 890);
    assert.ok((partials[0]?.gain ?? 0) > (partials.at(-1)?.gain ?? 1));
    assert.ok(partials.some((partial) => partial.detuneCents !== 0));
});

test("estimates pitch from a clean time-domain fallback frame", () => {
    const sampleRate = 48000;
    const frame = Float32Array.from({ length: 4096 }, (_, index) =>
        Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.35
    );

    const result = estimatePitchFromTimeDomain(frame, sampleRate);

    assert.ok(result.frequency > 438 && result.frequency < 442);
    assert.ok(result.confidence > 0.7);
});

test("ignores quiet fallback frames", () => {
    const frame = new Float32Array(4096);

    const result = estimatePitchFromTimeDomain(frame, 48000);

    assert.equal(result.frequency, 0);
    assert.equal(result.confidence, 0);
});

test("medianOfNumbers rejects a single outlier", () => {
    assert.equal(medianOfNumbers([440, 441, 880, 439, 440]), 440);
    assert.equal(medianOfNumbers([2, 4]), 3);
    assert.equal(medianOfNumbers([]), 0);
});

test("tracker waits for the onset to settle before recording", () => {
    const tracker = createPitchTracker(STD);

    const onset = tracker.push(loud(440, 0));
    assert.equal(onset.phase, "attack");
    assert.equal(onset.recording, false);

    const early = tracker.push(loud(440, 20));
    assert.equal(early.recording, false, "still inside settleMs");

    const settled = tracker.push(loud(440, STD.settleMs + 10));
    assert.equal(settled.phase, "tracking");
    assert.equal(settled.recording, true);
    assert.equal(settled.snapped, true);
});

test("tracker discards a single-frame octave glitch without moving the readout", () => {
    const tracker = createPitchTracker(STD);
    tracker.push(loud(440, 0));
    tracker.push(loud(440, STD.settleMs + 10));

    const glitch = tracker.push(loud(880, 120));
    assert.equal(glitch.recording, false, "glitch frame is not recorded");
    assert.ok(Math.abs(glitch.frequency - 440) < 5, "readout holds near 440");

    const back = tracker.push(loud(440, 160));
    assert.equal(back.recording, true);
    assert.ok(Math.abs(back.frequency - 440) < 5);
});

test("tracker snaps to a genuinely sustained new note after holdMs", () => {
    const tracker = createPitchTracker(STD);
    tracker.push(loud(440, 0));
    tracker.push(loud(440, STD.settleMs + 10));

    const first = tracker.push(loud(660, 200));
    assert.equal(first.recording, false, "new pitch not accepted on first frame");

    const held = tracker.push(loud(660, 200 + STD.holdMs - 20));
    assert.equal(held.recording, false, "still inside holdMs");

    const snapped = tracker.push(loud(660, 200 + STD.holdMs + 10));
    assert.equal(snapped.snapped, true);
    assert.equal(snapped.recording, true);
    assert.ok(Math.abs(snapped.frequency - 660) < 5);
});

test("tracker returns to idle after sustained silence", () => {
    const tracker = createPitchTracker(STD);
    tracker.push(loud(440, 0));
    tracker.push(loud(440, STD.settleMs + 10));
    assert.equal(tracker.phase, "tracking");

    const quiet = { frequency: 0, confidence: 0, rms: 0.001 };
    tracker.push({ ...quiet, at: 200 });
    assert.equal(tracker.phase, "tracking", "brief gap keeps the note");

    tracker.push({ ...quiet, at: 200 + STD.silenceMs + 10 });
    assert.equal(tracker.phase, "idle");
});

test("tracker ignores blanked (metronome) frames without changing state", () => {
    const tracker = createPitchTracker(STD);
    tracker.push(loud(440, 0));
    const tracking = tracker.push(loud(440, STD.settleMs + 10));

    const blanked = tracker.push(loud(880, 120, { blanked: true }));
    assert.equal(blanked.recording, false);
    assert.equal(tracker.phase, "tracking");
    assert.equal(blanked.frequency, tracking.frequency);
});

test("response profiles trade smoothing for responsiveness", () => {
    const stable = getTrackerConfig("stable");
    const sensitive = getTrackerConfig("sensitive");

    assert.ok(stable.smoothingAlpha < sensitive.smoothingAlpha);
    assert.ok(stable.holdMs > sensitive.holdMs);
    assert.ok(stable.medianWindow > sensitive.medianWindow);
});

const EVAL = getEvaluatorConfig();
const frameAt = (at, midi, hzDelta, recording = true) => ({
    at,
    recording,
    midi,
    label: `m${midi}`,
    cents: hzDelta * 4,
    hzDelta,
    toleranceHz: 5,
});

const feed = (evaluator, frames) => {
    const verdicts = [];
    for (const frame of frames) {
        const verdict = evaluator.push(frame);
        if (verdict) verdicts.push(verdict);
    }
    const tail = evaluator.flush();
    if (tail) verdicts.push(tail);
    return verdicts;
};

test("evaluator scores a sustained in-tune note", () => {
    const evaluator = createSustainedNoteEvaluator(EVAL);
    const frames = [];
    for (let at = 0; at <= 400; at += 40) frames.push(frameAt(at, 69, 1));

    const [verdict] = feed(evaluator, frames);
    assert.equal(verdict.inTune, true);
    assert.equal(verdict.direction, "center");
    assert.ok(verdict.durationMs >= EVAL.minSustainMs);
});

test("evaluator flags a sustained note that sits beyond the green zone", () => {
    const evaluator = createSustainedNoteEvaluator(EVAL);
    const frames = [];
    for (let at = 0; at <= 400; at += 40) frames.push(frameAt(at, 69, -9));

    const [verdict] = feed(evaluator, frames);
    assert.equal(verdict.inTune, false);
    assert.equal(verdict.direction, "flat");
});

test("evaluator treats vibrato around the centre as in tune", () => {
    const evaluator = createSustainedNoteEvaluator(EVAL);
    const frames = [];
    for (let i = 0; i < 16; i += 1) {
        // Sinusoidal ±8 Hz swing (well outside the 5 Hz band) centred on target.
        frames.push(frameAt(i * 40, 69, 8 * Math.sin((2 * Math.PI * i) / 8)));
    }

    const [verdict] = feed(evaluator, frames);
    assert.equal(verdict.inTune, true, "median of a centred swing is in tune");
    assert.ok(Math.abs(verdict.medianHzDelta) < 1);
});

test("evaluator ignores notes shorter than the sustain threshold", () => {
    const evaluator = createSustainedNoteEvaluator(EVAL);
    const verdicts = feed(evaluator, [
        frameAt(0, 69, 12),
        frameAt(40, 69, 12),
        frameAt(80, 69, 12),
    ]);
    assert.equal(verdicts.length, 0, "a 80ms blip is not a tuning attempt");
});

test("evaluator emits one verdict per sustained note when the pitch changes", () => {
    const evaluator = createSustainedNoteEvaluator(EVAL);
    const frames = [];
    for (let at = 0; at <= 400; at += 40) frames.push(frameAt(at, 69, 1));
    for (let at = 440; at <= 840; at += 40) frames.push(frameAt(at, 71, 9));

    const verdicts = feed(evaluator, frames);
    assert.equal(verdicts.length, 2);
    assert.equal(verdicts[0].midi, 69);
    assert.equal(verdicts[0].inTune, true);
    assert.equal(verdicts[1].midi, 71);
    assert.equal(verdicts[1].inTune, false);
});

test("smoothPathSegments emits one cubic per gap and keeps a straight line straight", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const segments = smoothPathSegments(points);

    assert.equal(segments.length, 2);
    for (const segment of segments) {
        assert.ok(Math.abs(segment.cp1.y) < 1e-9, "controls stay on the line");
        assert.ok(Math.abs(segment.cp2.y) < 1e-9);
    }
    assert.deepEqual(segments.at(-1).end, { x: 20, y: 0 });
});

test("smoothPathSegments scales the curve handle with segment length", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 110, y: 0 }];
    const segments = smoothPathSegments(points, 0.3);

    const shortHandle = segments[0].cp1.x - points[0].x;
    const longHandle = segments[1].cp1.x - points[1].x;
    assert.ok(longHandle > shortHandle, "a longer gap bends more than a short one");
});

test("smoothPathSegments needs at least two points", () => {
    assert.deepEqual(smoothPathSegments([]), []);
    assert.deepEqual(smoothPathSegments([{ x: 1, y: 2 }]), []);
});
