import test from "node:test";
import assert from "node:assert/strict";

import { pageRenderPriority, resolvePageJump } from "./page-navigation.ts";

test("page jumps clamp numeric input to the document range", () => {
    assert.equal(resolvePageJump("0", 4, 12, "single"), 1);
    assert.equal(resolvePageJump("18", 4, 12, "single"), 12);
    assert.equal(resolvePageJump(" 7 ", 4, 12, "continuous"), 7);
});

test("page jumps restore the current page for invalid input", () => {
    assert.equal(resolvePageJump("4.5", 4, 12, "single"), 4);
    assert.equal(resolvePageJump("four", 4, 12, "continuous"), 4);
    assert.equal(resolvePageJump("", 4, 12, "single"), 4);
});

test("double-page jumps align to an odd-numbered spread start", () => {
    assert.equal(resolvePageJump("6", 1, 12, "double"), 5);
    assert.equal(resolvePageJump("12", 1, 12, "double"), 11);
    assert.equal(resolvePageJump("1", 5, 12, "double"), 1);
});

test("continuous readers render the jump target before its adjacent pages", () => {
    assert.deepEqual(pageRenderPriority(8, 12), [8, 7, 9]);
    assert.deepEqual(pageRenderPriority(1, 12), [1, 2]);
    assert.deepEqual(pageRenderPriority(12, 12), [12, 11]);
});
