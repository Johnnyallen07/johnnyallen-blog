import test from 'node:test';
import assert from 'node:assert';
import { scoreAttempt } from './scoring.ts';
import { createHintLedger, takeHint } from './hints.ts';

// Helper fixtures
const mockLick = {
    notes: [
        { midi: 60, beats: 1 },
        { midi: 62, beats: 1 },
        { midi: 64, beats: 1 },
        { midi: 65, beats: 1 },
        { midi: 67, beats: 2 }
    ],
    tonicMidi: 60,
    mode: "major",
    tempoBpm: 60,
    world: 1,
    seed: 0
};

function perform(lick, { centsErrors = [], timingJitterS = [], transpose = 0, omitAt = -1, insertAt = -1, insertMidi = 63, stretch = 1.0 } = {}) {
    const events = [];
    let beatTime = 0.0;
    const bps = lick.tempoBpm / 60;
    
    for (let i = 0; i < lick.notes.length; i++) {
        if (i === insertAt) {
            events.push({
                onsetS: beatTime / bps * stretch,
                offsetS: (beatTime + 0.5) / bps * stretch,
                midi: insertMidi,
                centsOffNearest: 0,
                confidence: 1.0, nFrames: 5, stableFrames: 5
            });
            beatTime += 0.5;
        }

        if (i === omitAt) {
            beatTime += lick.notes[i].beats;
            continue;
        }
        
        let onsetS = beatTime / bps * stretch;
        if (timingJitterS[i]) onsetS += timingJitterS[i];
        
        events.push({
            onsetS,
            offsetS: onsetS + (lick.notes[i].beats / bps * stretch) * 0.9,
            midi: lick.notes[i].midi + transpose + (centsErrors[i] || 0) / 100.0,
            centsOffNearest: centsErrors[i] || 0,
            confidence: 1.0, nFrames: 10, stableFrames: 10
        });
        beatTime += lick.notes[i].beats;
    }
    return events;
}

test("perfect performance scores 3 stars and intonation 1.0", () => {
    const events = perform(mockLick);
    const score = scoreAttempt(mockLick, events);
    assert.equal(score.stars, 3);
    assert.equal(score.intonation, 1.0);
    assert.ok(score.feedback.some(f => f.code === "clean"));
});

test("tempo invariance of the rhythm score", () => {
    // Normal speed
    const normalEvents = perform(mockLick);
    const normalScore = scoreAttempt(mockLick, normalEvents);
    
    // Stretch speed 1.4x
    const slowEvents = perform(mockLick, { stretch: 1.4 });
    const slowScore = scoreAttempt(mockLick, slowEvents);

    assert.ok(normalScore.rhythm !== null);
    assert.ok(slowScore.rhythm !== null);
    assert.ok(Math.abs(normalScore.rhythm - slowScore.rhythm) < 1e-6);
});

test("alignment handles inserted and omitted notes without cascading failure", () => {
    // Both insert and omit
    const events = perform(mockLick, { omitAt: 1, insertAt: 3 });
    const score = scoreAttempt(mockLick, events);
    
    const { alignment } = score;
    assert.equal(alignment.nDetected, 5); // 5 notes (1 omitted, 1 inserted, 4 matched out of 5 target)
    
    // Check missing note feedback
    assert.ok(score.feedback.some(f => f.code === "missedNotes" && f.count === 1));
    // Check inserted note feedback
    assert.ok(score.feedback.some(f => f.code === "extraNotes" && f.count === 1));
});

test("flattery regression: grossly mistuned notes must fail, not be excluded", () => {
    // 70 cents sharp every note. SEVERE_INTONATION is 1.5st (150 cents).
    // So 70 cents is less than cap, so it counts towards intonation but gets 0 credit.
    const cents = Array(5).fill(70);
    const events = perform(mockLick, { centsErrors: cents });
    const score = scoreAttempt(mockLick, events);
    
    assert.ok(score.intonation < 0.3); // Must not be 1.0
    assert.equal(score.stars, 0); // Fails
});

test("wrong note and badly out of tune are different messages", () => {
    // One note 70c flat (bad tuning), another note totally wrong (+300c), and one correct.
    const mock2 = {
        ...mockLick,
        notes: [
            { midi: 60, beats: 1 },
            { midi: 62, beats: 1 },
            { midi: 64, beats: 1 }
        ]
    };
    const events = perform(mock2, { centsErrors: [-70, 300, 0] });
    const score = scoreAttempt(mock2, events);
    
    assert.ok(score.feedback.some(f => f.code === "badlyTuned"));
    assert.ok(score.feedback.some(f => f.code === "wrongNotes"));
});

test("open string alarm: single note beyond 40 cents", () => {
    const lickOpen = {
        ...mockLick,
        notes: [ { midi: 69, beats: 1 }, { midi: 71, beats: 1 } ],
        tonicMidi: 69
    };
    // 69 is A4, an open string.
    const events = perform(lickOpen, { centsErrors: [41, 0] });
    const score = scoreAttempt(lickOpen, events);
    
    assert.ok(score.feedback.some(f => f.code === "openStringDetuned"));
});

test("open string alarm: >= 2 notes > 20 cents same sign", () => {
    const lickOpen = {
        notes: [ { midi: 69, beats: 1 }, { midi: 71, beats: 1 }, { midi: 69, beats: 1 } ],
        tonicMidi: 69, mode: "major", tempoBpm: 60, world: 1, seed: 0
    };
    const events = perform(lickOpen, { centsErrors: [21, 0, 21] });
    const score = scoreAttempt(lickOpen, events);
    
    assert.ok(score.feedback.some(f => f.code === "openStringDetuned"));
});

test("relative mode ignores overall tuning shift for intonation", () => {
    const lick = mockLick;
    // Transpose play up by 5 semitones but play in tune there
    const events = perform(lick, { transpose: 5 });
    
    const relScore = scoreAttempt(lick, events, { mode: "relative" });
    
    // In relative mode, it should find the +5 transpose and give perfect intonation
    assert.ok(relScore.intonation > 0.9); 
});

test("showing notation forfeits the attempt", () => {
    const ledger = createHintLedger();
    takeHint(ledger, "reveal_score");
    const score = scoreAttempt(mockLick, perform(mockLick), { ledger });
    
    assert.equal(score.stars, 0);
    assert.equal(score.total, 0.0);
});
