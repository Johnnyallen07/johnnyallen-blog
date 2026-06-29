import test from "node:test";
import assert from "node:assert/strict";

import {
    advanceSchedule,
    blankWindowFor,
    clampBeatsPerBar,
    clampBpm,
    secondsPerBeat,
} from "./metronome.ts";

test("clamps tempo and time signature to safe ranges", () => {
    assert.equal(clampBpm(120), 120);
    assert.equal(clampBpm(5), 30);
    assert.equal(clampBpm(900), 300);
    assert.equal(clampBpm(Number.NaN), 120);
    assert.equal(clampBeatsPerBar(4), 4);
    assert.equal(clampBeatsPerBar(0), 1);
    assert.equal(clampBeatsPerBar(99), 12);
});

test("computes seconds per beat from tempo", () => {
    assert.equal(secondsPerBeat(120), 0.5);
    assert.equal(secondsPerBeat(60), 1);
});

test("schedules every click up to the lookahead horizon and accents the downbeat", () => {
    const { clicks, cursor } = advanceSchedule({ nextNoteTime: 0, beat: 0 }, 1.0, 120, 4);

    assert.deepEqual(clicks.map((click) => click.time), [0, 0.5, 1.0]);
    assert.deepEqual(clicks.map((click) => click.beat), [0, 1, 2]);
    assert.equal(clicks[0].accent, true);
    assert.equal(clicks[1].accent, false);
    assert.equal(cursor.beat, 3);
    assert.equal(cursor.nextNoteTime, 1.5);
});

test("wraps the beat counter at the bar boundary", () => {
    const { clicks } = advanceSchedule({ nextNoteTime: 0, beat: 0 }, 1.5, 120, 2);

    assert.deepEqual(clicks.map((click) => click.beat), [0, 1, 0, 1]);
    assert.deepEqual(clicks.map((click) => click.accent), [true, false, true, false]);
});

test("emits nothing when the horizon precedes the next click", () => {
    const { clicks, cursor } = advanceSchedule({ nextNoteTime: 5, beat: 2 }, 1.0, 120, 4);

    assert.equal(clicks.length, 0);
    assert.deepEqual(cursor, { nextNoteTime: 5, beat: 2 });
});

test("blank window brackets the click time", () => {
    const window = blankWindowFor(2, 0.18);

    assert.ok(window.from < 2);
    assert.ok(window.to > 2);
    assert.ok(window.to - window.from >= 0.18);
});
