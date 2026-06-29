import test from "node:test";
import assert from "node:assert/strict";

import {
    calculateBufferedPercent,
    calculateProgressPercent,
    calculateThroughputKbps,
} from "./player-metrics.ts";

function makeRanges(ranges) {
    return {
        length: ranges.length,
        start: (index) => ranges[index]?.[0] ?? 0,
        end: (index) => ranges[index]?.[1] ?? 0,
    };
}

test("progress follows playback time independent of cached amount", () => {
    assert.equal(calculateProgressPercent(45, 180), 25);
    assert.equal(calculateProgressPercent(240, 180), 100);
});

test("buffered percent uses the farthest buffered audio range", () => {
    const buffered = makeRanges([
        [0, 15],
        [30, 60],
    ]);

    assert.equal(calculateBufferedPercent(buffered, 120), 50);
});

test("throughput is calculated from byte deltas over elapsed time", () => {
    assert.equal(calculateThroughputKbps(1_250_000, 250_000, 2000), 4000);
    assert.equal(calculateThroughputKbps(1_250_000, 250_000, 0), 0);
});
