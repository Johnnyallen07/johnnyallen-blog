import test from "node:test";
import assert from "node:assert/strict";

import {
    calculateBufferedPercent,
    calculateDownloadedPercent,
    calculateDisplayedBufferPercent,
    calculateProgressPercent,
    getContiguousBufferedEnd,
    getRetryResumeTime,
    getStablePlaybackTime,
    hasBufferedDataAhead,
    getBufferedEndAtTime,
    getBufferedAheadSeconds,
    shouldRestartBufferRequest,
    hasCompleteMediaMetadata,
    getRecoveryDelayMs,
    calculatePlaybackClockTime,
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

test("stable playback time cannot roll back during buffering or reload", () => {
    assert.equal(getStablePlaybackTime(0, 128.4), 128.4);
    assert.equal(getStablePlaybackTime(91.2, 128.4, 130), 130);
    assert.equal(getStablePlaybackTime(142.1, 128.4, 130), 142.1);
});

test("resume waits until the current position has playable data ahead", () => {
    const ranges = makeRanges([[0, 12], [20, 30]]);

    assert.equal(hasBufferedDataAhead(ranges, 11.7, 0.5, 60), false);
    assert.equal(hasBufferedDataAhead(ranges, 10, 0.5, 60), true);
    assert.equal(hasBufferedDataAhead(ranges, 19, 0.5, 60), false);
    assert.equal(hasBufferedDataAhead(ranges, 29.8, 0.5, 30), true);
});

test("buffer health follows the range containing the playback position", () => {
    const ranges = makeRanges([[0, 12], [20, 35]]);

    assert.equal(getBufferedEndAtTime(ranges, 10), 12);
    assert.equal(getBufferedAheadSeconds(ranges, 10), 2);
    assert.equal(getBufferedEndAtTime(ranges, 25), 35);
    assert.equal(getBufferedAheadSeconds(ranges, 25), 10);
    assert.equal(getBufferedEndAtTime(ranges, 15), null);
    assert.equal(getBufferedAheadSeconds(ranges, 15), 0);
});

test("buffer request restarts only after an online wait has genuinely stalled", () => {
    assert.equal(shouldRestartBufferRequest(true, 0, 2500, true), true);
    assert.equal(shouldRestartBufferRequest(true, 1, 5000, true), false);
    assert.equal(shouldRestartBufferRequest(false, 0, 5000, true), false);
    assert.equal(shouldRestartBufferRequest(true, 0, 5000, false), false);
    assert.equal(shouldRestartBufferRequest(true, 0, 2499, true), false);
    assert.equal(shouldRestartBufferRequest(true, 1, 2500, true, 2500, 2), true);
});

test("metadata is complete only with a usable duration", () => {
    assert.equal(hasCompleteMediaMetadata(0, 180), false);
    assert.equal(hasCompleteMediaMetadata(1, Number.NaN), false);
    assert.equal(hasCompleteMediaMetadata(1, Number.POSITIVE_INFINITY), false);
    assert.equal(hasCompleteMediaMetadata(1, 180), true);
});

test("recovery delay backs off but stays bounded", () => {
    assert.equal(getRecoveryDelayMs(1), 1000);
    assert.equal(getRecoveryDelayMs(2), 2000);
    assert.equal(getRecoveryDelayMs(5), 15000);
    assert.equal(getRecoveryDelayMs(30), 15000);
});

test("playback clock advances only while running and never depends on media loading", () => {
    assert.equal(calculatePlaybackClockTime(42, null, 50_000), 42);
    assert.equal(calculatePlaybackClockTime(42, 10_000, 12_500), 44.5);
    assert.equal(calculatePlaybackClockTime(42, 10_000, 12_500, 2), 47);
    assert.equal(calculatePlaybackClockTime(59, 10_000, 12_500, 1, 60), 60);
});
