import test from "node:test";
import assert from "node:assert/strict";

import {
    calculateBufferedPercent,
    calculateDownloadedPercent,
    calculateDisplayedBufferPercent,
    calculateProgressPercent,
    calculateThroughputKbps,
    shouldShowBufferStatus,
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

test("download percent follows loaded bytes and clamps to 100", () => {
    assert.equal(calculateDownloadedPercent(340, 1000), 34);
    assert.equal(calculateDownloadedPercent(1200, 1000), 100);
    assert.equal(calculateDownloadedPercent(1200, 0), 0);
});

test("displayed buffer percent uses the freshest available source", () => {
    assert.equal(calculateDisplayedBufferPercent(34, 51), 51);
    assert.equal(calculateDisplayedBufferPercent(62, 51), 62);
});

test("buffer status hides once cache is effectively complete", () => {
    assert.equal(shouldShowBufferStatus(99.4), true);
    assert.equal(shouldShowBufferStatus(99.5), false);
    assert.equal(shouldShowBufferStatus(100), false);
});
