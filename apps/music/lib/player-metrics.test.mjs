import test from "node:test";
import assert from "node:assert/strict";

import {
    calculateBufferedPercent,
    calculateDownloadedPercent,
    calculateDisplayedBufferPercent,
    calculateProgressPercent,
    getContiguousBufferedEnd,
    getRetryResumeTime,
    isTimeWithinRanges,
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

test("buffered percent only counts data contiguous from the start", () => {
    // A forward seek leaves a hole: [0-15s] + [30-60s]. Only the first 15s
    // are actually playable without hitting the network again.
    const buffered = makeRanges([
        [0, 15],
        [30, 60],
    ]);

    assert.equal(calculateBufferedPercent(buffered, 120), 12.5);
});

test("contiguous buffered end bridges sub-tolerance gaps and stops at holes", () => {
    assert.equal(getContiguousBufferedEnd(makeRanges([[0, 15], [15.3, 60]])), 60);
    assert.equal(getContiguousBufferedEnd(makeRanges([[15.3, 60], [0, 15]])), 60);
    assert.equal(getContiguousBufferedEnd(makeRanges([[0, 15], [30, 60]])), 15);
    assert.equal(getContiguousBufferedEnd(makeRanges([[10, 60]])), 0);
    assert.equal(getContiguousBufferedEnd(makeRanges([])), 0);
});

test("time membership in ranges honors the tolerance window", () => {
    const seekable = makeRanges([[0, 30], [60, 90]]);

    assert.equal(isTimeWithinRanges(seekable, 15), true);
    assert.equal(isTimeWithinRanges(seekable, 30.2), true);
    assert.equal(isTimeWithinRanges(seekable, 45), false);
    assert.equal(isTimeWithinRanges(seekable, 61), true);
    assert.equal(isTimeWithinRanges(seekable, NaN), false);
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

test("retry resume time preserves the last known playback position", () => {
    assert.equal(getRetryResumeTime(0, 128.4), 128.4);
    assert.equal(getRetryResumeTime(91.2, 128.4), 128.4);
    assert.equal(getRetryResumeTime(142.1, 128.4), 142.1);
});
