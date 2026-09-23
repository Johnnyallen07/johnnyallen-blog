import test from 'node:test';
import assert from 'node:assert';
import { align } from './align.ts';

test("identical sequences align perfectly", () => {
    const a = align([60, 62, 64], [60.0, 62.0, 64.0]);
    let nMatch = 0;
    for (const p of a.pairs) if (p.op === "match") nMatch++;
    let errors = 0;
    for (const p of a.pairs) if (p.op !== "match") errors++;

    assert.equal(nMatch, 3);
    assert.equal(errors, 0);
});

test("small tuning errors still count as matches", () => {
    const a = align([60, 62], [60.3, 61.7]);
    let nMatch = 0;
    for (const p of a.pairs) if (p.op === "match") nMatch++;
    assert.equal(nMatch, 2);
});

test("a wrong note is a substitution", () => {
    const a = align([60, 62, 64], [60.0, 63.0, 64.0]);
    let nMatch = 0, nSub = 0;
    for (const p of a.pairs) {
        if (p.op === "match") nMatch++;
        if (p.op === "sub") nSub++;
    }
    assert.equal(nMatch, 2);
    assert.equal(nSub, 1);
});
