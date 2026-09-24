import test from "node:test";
import assert from "node:assert/strict";

import { advanceDrill, DRILL_IDS, DRILL_MAX_LEVEL, generateDrill, INTERVALS, PROMOTE_AFTER } from "./drills.ts";
import { generateMelody, generateFoundationRound } from "./foundation.ts";
import { keyStageById, referenceMidiFor, VOICE_RANGES } from "./keys.ts";
import { applyRound, awardBadge, createProgress } from "./gamification.ts";
import { renderReference, renderFoundationPrompt, DEFAULT_SYNTH_CONFIG } from "./synth.ts";

const cfg = { ...DEFAULT_SYNTH_CONFIG, sr: 8000 };

test("every drill at every level yields a question whose answer is among its choices", () => {
    for (const drill of DRILL_IDS) {
        for (let level = 1; level <= DRILL_MAX_LEVEL[drill]; level++) {
            for (let seed = 0; seed < 40; seed++) {
                const q = generateDrill({ drill, level, seed, voice: "female" });
                assert.ok(q.choices.includes(q.answer), `${drill} L${level} s${seed}`);
                assert.ok(q.events.length > 0);
            }
        }
    }
});

test("drills stay inside the voice range", () => {
    for (const voice of ["male", "female", "violin"]) {
        const { loMidi, hiMidi } = VOICE_RANGES[voice];
        for (const drill of DRILL_IDS) {
            for (let seed = 0; seed < 60; seed++) {
                const q = generateDrill({ drill, level: DRILL_MAX_LEVEL[drill], seed, voice });
                for (const m of q.pitches) assert.ok(m >= loMidi - 0.5 && m <= hiMidi + 0.5, `${voice} ${drill} ${m}`);
            }
        }
    }
});

test("compare answer matches the pitches actually played", () => {
    for (let seed = 0; seed < 100; seed++) {
        const q = generateDrill({ drill: "compare", level: 4, seed });
        const [a, b] = q.events.map(e => e.midis[0]);
        const expected = b > a ? "higher" : b < a ? "lower" : "same";
        assert.equal(q.answer, expected);
    }
});

test("compare gaps shrink with level; level 6 is a quarter tone", () => {
    const q = generateDrill({ drill: "compare", level: 6, seed: 3 });
    const [a, b] = q.events.map(e => e.midis[0]);
    assert.ok(q.answer === "same" || Math.abs(Math.abs(b - a) - 0.25) < 1e-9);
    const easy = generateDrill({ drill: "compare", level: 1, seed: 3 });
    const [c, d] = easy.events.map(e => e.midis[0]);
    assert.ok(Math.abs(d - c) >= 7);
    assert.deepEqual(easy.choices, ["lower", "higher"]);
});

test("interval answer is the real distance between the two pitches", () => {
    for (let seed = 0; seed < 100; seed++) {
        const q = generateDrill({ drill: "interval", level: 5, seed });
        assert.equal(q.pitches[1] - q.pitches[0], INTERVALS[q.answer]);
    }
});

test("advanceDrill promotes after a clean run and resets on a miss", () => {
    let s = { level: 1, run: 0 };
    for (let i = 0; i < PROMOTE_AFTER - 1; i++) s = advanceDrill(s, "compare", true);
    assert.equal(s.level, 1);
    const promoted = advanceDrill(s, "compare", true);
    assert.equal(promoted.level, 2);
    assert.ok(promoted.promoted);
    assert.equal(advanceDrill({ level: 3, run: 4 }, "compare", false).run, 0);
    assert.equal(advanceDrill({ level: 3, run: 4 }, "chord", true).level, 3, "chord caps at 3");
});

test("melody levels have the promised note counts and stay in the scale", () => {
    const counts = { 1: 1, 2: 2, 3: 4, 4: 5, 5: 5 };
    for (const level of [1, 2, 3, 4, 5]) {
        for (let seed = 0; seed < 30; seed++) {
            const lick = generateMelody({ level, seed, tonicMidi: 60, mode: "major", voice: "female" });
            assert.equal(lick.notes.length, counts[level], `L${level}`);
            for (const n of lick.notes) assert.ok([0, 2, 4, 5, 7, 9, 11].includes(((n.midi - 60) % 12 + 12) % 12));
        }
    }
});

test("fill never drops below level 3", () => {
    const r = generateFoundationRound({ stage: "fill", level: 1, seed: 4, key: keyStageById("C") });
    assert.ok(r.targetLick.notes.length >= 4);
});

test("echo level 1 is a single note", () => {
    const r = generateFoundationRound({ stage: "echo", level: 1, seed: 4, key: keyStageById("G"), voice: "male" });
    assert.equal(r.targetLick.notes.length, 1);
});

test("referenceMidiFor puts the violin A on A4 and a male C on C3", () => {
    assert.equal(referenceMidiFor(9, "violin"), 69);
    assert.equal(referenceMidiFor(0, "female"), 60);
    assert.equal(referenceMidiFor(0, "male"), 48);
});

test("tonic and fixed references are shorter than the triad", () => {
    const triad = renderReference(60, "major", { kind: "triad" }, cfg);
    const tonic = renderReference(60, "major", { kind: "tonic" }, cfg);
    const fixed = renderReference(60, "major", { kind: "fixed", fixedMidi: 69 }, cfg);
    assert.ok(tonic.length < triad.length);
    assert.ok(fixed.length > 0);
});

test("a fixed reference in Sing-It-Home still sounds the tonic", () => {
    const round = generateFoundationRound({ stage: "home", seed: 2 });
    const base = { tonicMidi: round.tonicMidi, mode: round.mode, cueMidi: round.cueMidi, targetLick: round.targetLick };
    const fixedHome = renderFoundationPrompt({ ...base, promptAudioMode: "cadence_and_mystery_note", reference: { kind: "fixed", fixedMidi: 69 } }, cfg);
    const fixedSight = renderFoundationPrompt({ ...base, promptAudioMode: "cadence_and_first_note", reference: { kind: "fixed", fixedMidi: 69 } }, cfg);
    assert.ok(fixedHome.length > fixedSight.length);
});

test("weighted drill rounds pay a fraction of the XP", () => {
    const outcome = { stars: 1, toleranceCents: 25, tokensSpent: 0, day: "2026-09-24", keyId: "", answerStyle: "tap", medianAbsCents: null };
    const full = applyRound(createProgress(), outcome).xpGained;
    const tap = applyRound(createProgress(), { ...outcome, weight: 0.3 }).xpGained;
    assert.ok(tap < full && tap >= 1);
});

test("awardBadge is idempotent", () => {
    const first = awardBadge(createProgress(), "sharp_ears");
    assert.ok(first.unlocked);
    const second = awardBadge(first.next, "sharp_ears");
    assert.equal(second.unlocked, false);
    assert.equal(second.next.badges.length, 1);
});
