import test from "node:test";
import assert from "node:assert/strict";

import {
    applyRound,
    checkLadderComplete,
    createProgress,
    dayStamp,
    daysBetween,
    levelForXp,
    xpForLevel,
    xpForRound,
} from "./gamification.ts";

const round = (over = {}) => ({
    stars: 2,
    toleranceCents: 25,
    tokensSpent: 0,
    day: "2026-01-10",
    keyId: "C",
    answerStyle: "voice",
    medianAbsCents: 18,
    ...over,
});

test("more stars pay more", () => {
    const zero = xpForRound(round({ stars: 0 }));
    const one = xpForRound(round({ stars: 1 }));
    const three = xpForRound(round({ stars: 3 }));
    assert.ok(zero < one && one < three);
});

test("a zero-star round still pays something, so failing is not punished into quitting", () => {
    assert.ok(xpForRound(round({ stars: 0 })) > 0);
});

test("choosing a stricter tolerance is never the losing move", () => {
    // If strict play paid less, the rational player would farm the easy setting.
    let previous = 0;
    for (const toleranceCents of [35, 25, 15, 8]) {
        const xp = xpForRound(round({ stars: 3, toleranceCents }));
        assert.ok(xp > previous, `tolerance ${toleranceCents} paid ${xp}, not more than ${previous}`);
        previous = xp;
    }
});

test("hints cost experience but cannot drive it negative", () => {
    const clean = xpForRound(round({ stars: 3, tokensSpent: 0 }));
    const hinted = xpForRound(round({ stars: 3, tokensSpent: 2 }));
    assert.ok(hinted < clean);
    assert.ok(xpForRound(round({ stars: 0, tokensSpent: 40 })) > 0);
});

test("levels are monotonic and start at one", () => {
    assert.equal(levelForXp(0).level, 1);
    assert.equal(xpForLevel(1), 0);
    let previous = -1;
    for (let level = 1; level <= 40; level++) {
        const need = xpForLevel(level);
        assert.ok(need > previous, `level ${level} threshold not increasing`);
        previous = need;
    }
});

test("levels get longer but never explode out of reach", () => {
    for (let level = 2; level <= 30; level++) {
        const span = xpForLevel(level + 1) - xpForLevel(level);
        const previousSpan = xpForLevel(level) - xpForLevel(level - 1);
        assert.ok(span >= previousSpan, "level spans must not shrink");
        assert.ok(span <= previousSpan + 60, "level spans must grow linearly, not exponentially");
    }
});

test("levelForXp reports a consistent position inside the level", () => {
    for (const xp of [0, 1, 59, 60, 61, 500, 5000]) {
        const info = levelForXp(xp);
        assert.ok(info.into >= 0 && info.into < info.needed, `xp ${xp} -> ${JSON.stringify(info)}`);
        assert.equal(xpForLevel(info.level) + info.into, xp);
    }
});

test("levelForXp tolerates junk rather than returning NaN", () => {
    assert.equal(levelForXp(-500).level, 1);
    assert.equal(levelForXp(3.7).level, levelForXp(3).level);
});

test("day stamps and gaps line up across a month boundary", () => {
    assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
    assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1); // 2026 is not a leap year
    assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2); // 2024 is
    assert.equal(daysBetween("2026-01-10", "2026-01-10"), 0);
    assert.equal(daysBetween("2026-01-10", "2026-01-09"), -1);
});

test("dayStamp uses local time, not UTC", () => {
    const d = new Date(2026, 0, 5, 23, 30);
    assert.equal(dayStamp(d), "2026-01-05");
});

test("a first round starts the day streak at one", () => {
    const { next } = applyRound(createProgress(), round());
    assert.equal(next.dayStreak, 1);
    assert.equal(next.rounds, 1);
});

test("a second round on the same day does not double the streak", () => {
    const a = applyRound(createProgress(), round()).next;
    const b = applyRound(a, round()).next;
    assert.equal(b.dayStreak, 1);
    assert.equal(b.rounds, 2);
});

test("consecutive days extend the streak and a gap resets it", () => {
    let p = applyRound(createProgress(), round({ day: "2026-01-10" })).next;
    p = applyRound(p, round({ day: "2026-01-11" })).next;
    p = applyRound(p, round({ day: "2026-01-12" })).next;
    assert.equal(p.dayStreak, 3);

    const skipped = applyRound(p, round({ day: "2026-01-14" })).next;
    assert.equal(skipped.dayStreak, 1);
    assert.equal(skipped.bestDayStreak, 3, "the best is remembered even after a reset");
});

test("a clock that moves backwards restarts the streak instead of going negative", () => {
    let p = applyRound(createProgress(), round({ day: "2026-01-10" })).next;
    p = applyRound(p, round({ day: "2026-01-02" })).next;
    assert.equal(p.dayStreak, 1);
});

test("the combo grows on scoring rounds and dies on a zero", () => {
    let p = createProgress();
    for (let i = 0; i < 4; i++) p = applyRound(p, round({ stars: 1 })).next;
    assert.equal(p.combo, 4);
    p = applyRound(p, round({ stars: 0 })).next;
    assert.equal(p.combo, 0);
    assert.equal(p.bestCombo, 4);
});

test("the combo increases the payout", () => {
    let p = createProgress();
    const first = applyRound(p, round({ stars: 2 }));
    p = first.next;
    for (let i = 0; i < 6; i++) p = applyRound(p, round({ stars: 2 })).next;
    const later = applyRound(p, round({ stars: 2 }));
    assert.ok(later.xpGained > first.xpGained);
});

test("three stars clears the key, fewer does not", () => {
    const weak = applyRound(createProgress(), round({ stars: 2, keyId: "C" })).next;
    assert.deepEqual(weak.keysCleared, []);
    const strong = applyRound(createProgress(), round({ stars: 3, keyId: "C" })).next;
    assert.deepEqual(strong.keysCleared, ["C"]);
});

test("a key is only ever recorded once", () => {
    let p = applyRound(createProgress(), round({ stars: 3, keyId: "C" })).next;
    p = applyRound(p, round({ stars: 3, keyId: "C" })).next;
    assert.deepEqual(p.keysCleared, ["C"]);
});

test("badges fire once and are never re-awarded", () => {
    const first = applyRound(createProgress(), round({ stars: 3, medianAbsCents: 4 }));
    assert.ok(first.unlocked.includes("flawless"));
    assert.ok(first.unlocked.includes("dead_centre"));

    const second = applyRound(first.next, round({ stars: 3, medianAbsCents: 4 }));
    assert.equal(second.unlocked.includes("flawless"), false);
    assert.equal(second.next.badges.filter((b) => b === "flawless").length, 1);
});

test("dead centre needs a measurement, not a missing one", () => {
    const { unlocked } = applyRound(createProgress(), round({ stars: 3, medianAbsCents: null }));
    assert.equal(unlocked.includes("dead_centre"), false);
});

test("the no-hints badge requires both three stars and no tokens", () => {
    const hinted = applyRound(createProgress(), round({ stars: 3, tokensSpent: 1 }));
    assert.equal(hinted.unlocked.includes("no_hints"), false);
    const clean = applyRound(createProgress(), round({ stars: 3, tokensSpent: 0 }));
    assert.ok(clean.unlocked.includes("no_hints"));
});

test("using both the voice and the violin earns the crossover badge", () => {
    const sung = applyRound(createProgress(), round({ answerStyle: "voice" }));
    assert.equal(sung.unlocked.includes("both_voices"), false);
    const played = applyRound(sung.next, round({ answerStyle: "violin" }));
    assert.ok(played.unlocked.includes("both_voices"));
});

test("levelling up is reported so the UI can celebrate it", () => {
    let p = createProgress();
    let sawLevelUp = false;
    for (let i = 0; i < 12; i++) {
        const result = applyRound(p, round({ stars: 3 }));
        p = result.next;
        if (result.leveledUp) sawLevelUp = true;
    }
    assert.ok(sawLevelUp);
    assert.ok(levelForXp(p.xp).level > 1);
});

test("applyRound does not mutate what it was given", () => {
    const before = createProgress();
    const snapshot = JSON.stringify(before);
    applyRound(before, round({ stars: 3 }));
    assert.equal(JSON.stringify(before), snapshot);
});

test("the ladder badge waits for every key", () => {
    let p = createProgress();
    for (const keyId of ["C", "G", "F"]) {
        p = applyRound(p, round({ stars: 3, keyId })).next;
    }
    assert.equal(checkLadderComplete(p, 7).badges.includes("ladder_complete"), false);
    assert.ok(checkLadderComplete(p, 3).badges.includes("ladder_complete"));
});
