import test from "node:test";
import assert from "node:assert/strict";

import { generateLick, getWorld, Random, lickToDict, lickFromDict } from "./licks.ts";
import { candidateFingerings, intervalsOf, scalePitches } from "./theory.ts";

test("RNG maintains determinism and avoids simple degeneracies", () => {
    const rng = new Random(12345);
    const bounds = { min: 1.0, max: 0.0 };
    for (let i = 0; i < 1000; i++) {
        const v = rng.nextFloat();
        if (v < bounds.min) bounds.min = v;
        if (v > bounds.max) bounds.max = v;
    }
    assert.ok(bounds.min >= 0 && bounds.min < 0.1);
    assert.ok(bounds.max > 0.9 && bounds.max < 1.0);
    
    // choices weighting test
    const seq = ["A", "B"];
    let aCount = 0;
    for (let i = 0; i < 1000; i++) {
        const val = rng.choices(seq, [90, 10]);
        if (val === "A") aCount++;
    }
    assert.ok(aCount > 850 && aCount < 950, `weighted choice failure: ${aCount}`);
});

test("Determinism: same seed produces an identical lick 100 times over", () => {
    const first = generateLick({ world: 5, seed: 1001 });
    for (let i = 0; i < 100; i++) {
        const next = generateLick({ world: 5, seed: 1001 });
        assert.deepEqual(next, first);
    }
});

test("Validates constraints across ~1200 generated licks", () => {
    for (let w = 1; w <= 6; w++) {
        const spec = getWorld(w);
        for (let i = 0; i < 200; i++) {
            const seed = 5000 + i;
            const lick = generateLick({ world: w, seed });
            
            // Note count
            assert.ok(
                lick.notes.length >= spec.numNotes[0] &&
                lick.notes.length <= spec.numNotes[1],
                `W${w} note count ${lick.notes.length} not in ${spec.numNotes}`
            );
            
            const pitches = lick.notes.map(n => n.midi);
            
            // midiRange
            for (const p of pitches) {
                assert.ok(
                    p >= spec.midiRange[0] && p <= spec.midiRange[1],
                    `W${w} pitch ${p} outside ${spec.midiRange}`
                );
            }
            
            // allowedIntervals
            const intervals = intervalsOf(pitches);
            for (const s of intervals) {
                const size = Math.abs(s);
                if (size !== 0) {
                    assert.ok(
                        spec.allowedIntervals.includes(size),
                        `W${w} interval ${size} not in ${spec.allowedIntervals}`
                    );
                }
            }
            
            // maxPosition
            for (const p of pitches) {
                // At least one candidate fingering must be within maxPosition
                let reachable = false;
                for (const fingering of candidateFingerings(p)) {
                    if (fingering.position <= spec.maxPosition) {
                        reachable = true;
                        break;
                    }
                }
                assert.ok(reachable, `W${w} pitch ${p} not playable within pos ${spec.maxPosition}`);
            }
            
            // mode (every pitch is in the declared mode pool)
            const allowedPc = new Set();
            for (let i = spec.midiRange[0]; i <= spec.midiRange[1]; i++) allowedPc.add(i);
            const modePool = new Set(scalePitches(lick.tonicMidi, lick.mode, lick.tonicMidi - 24, lick.tonicMidi + 24).map(m => m % 12));
            for (const p of pitches) {
                assert.ok(modePool.has(p % 12), `W${w} pitch ${p} (PC ${p % 12}) not in mode ${lick.mode}`);
            }
        }
    }
});

test("phrase-ending repair logic ensures stable ending", () => {
    // Tests that the last note lands on a stable scale degree.
    // In theory, fallback might happen, but across 100 random seeds,
    // they should all end on either the tonic or the dominant.
    for (let i = 0; i < 100; i++) {
        const lick = generateLick({ world: 4, seed: 10000 + i });
        const tonicPc = ((lick.tonicMidi % 12) + 12) % 12;
        const domPc = (tonicPc + 7) % 12;
        
        const finalNoteId = lick.notes.length - 1;
        const finalPc = ((lick.notes[finalNoteId].midi % 12) + 12) % 12;
        
        const wanted = new Set([tonicPc, domPc]);
        assert.ok(
            wanted.has(finalPc),
            `Final note PC ${finalPc} is not stable (tonic ${tonicPc}, dom ${domPc}) for seed ${lick.seed}`
        );
    }
});

test("round-trips toDict and fromDict", () => {
    const lick = generateLick({ world: 6, seed: 42 });
    const dict = lickToDict(lick);
    const restored = lickFromDict(dict);
    assert.deepEqual(restored, lick);
});
