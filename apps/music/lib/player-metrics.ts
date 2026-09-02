export function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

export function calculateProgressPercent(currentTime: number, duration: number): number {
    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
        return 0;
    }
    return clampPercent((currentTime / duration) * 100);
}

/**
 * Contiguous buffered coverage measured from the start of the track.
 * Seeking creates holes in `buffered`; counting the farthest range end would
 * report 100% while the middle of the track has no data, so only ranges that
 * chain together from 0 (bridging sub-`gapToleranceSeconds` gaps) count.
 */
export function getContiguousBufferedEnd(
    buffered: TimeRanges,
    gapToleranceSeconds = 0.5,
): number {
    const ranges: Array<[number, number]> = [];
    for (let index = 0; index < buffered.length; index += 1) {
        ranges.push([buffered.start(index), buffered.end(index)]);
    }
    ranges.sort((a, b) => a[0] - b[0]);

    let contiguousEnd = 0;
    for (const [start, end] of ranges) {
        if (start > contiguousEnd + gapToleranceSeconds) break;
        contiguousEnd = Math.max(contiguousEnd, end);
    }
    return contiguousEnd;
}

export function calculateBufferedPercent(buffered: TimeRanges, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return clampPercent((getContiguousBufferedEnd(buffered) / duration) * 100);
}

export function isTimeWithinRanges(
    ranges: TimeRanges,
    time: number,
    toleranceSeconds = 0.25,
): boolean {
    if (!Number.isFinite(time)) return false;
    for (let index = 0; index < ranges.length; index += 1) {
        if (
            time >= ranges.start(index) - toleranceSeconds &&
            time <= ranges.end(index) + toleranceSeconds
        ) {
            return true;
        }
    }
    return false;
}

export function calculateDownloadedPercent(loadedBytes: number, totalBytes: number): number {
    if (!Number.isFinite(loadedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) {
        return 0;
    }
    return clampPercent((loadedBytes / totalBytes) * 100);
}

export function calculateDisplayedBufferPercent(
    mediaBufferedPercent: number,
    downloadedPercent: number,
): number {
    return clampPercent(Math.max(mediaBufferedPercent, downloadedPercent));
}

export function shouldShowBufferStatus(bufferedPercent: number): boolean {
    return clampPercent(bufferedPercent) < 99.5;
}

export function getRetryResumeTime(mediaCurrentTime: number, lastKnownTime: number): number {
    const mediaTime = Number.isFinite(mediaCurrentTime) && mediaCurrentTime > 0
        ? mediaCurrentTime
        : 0;
    const knownTime = Number.isFinite(lastKnownTime) && lastKnownTime > 0
        ? lastKnownTime
        : 0;
    return Math.max(mediaTime, knownTime);
}

/**
 * Playback time shown by the UI must never move behind the last committed
 * position because a media element was reloading or temporarily starved.
 * Backward movement is handled explicitly by the seek controls instead.
 */
export function getStablePlaybackTime(
    mediaCurrentTime: number,
    lastKnownTime: number,
    heldTime?: number | null,
): number {
    const mediaTime = Number.isFinite(mediaCurrentTime) && mediaCurrentTime >= 0
        ? mediaCurrentTime
        : 0;
    const knownTime = Number.isFinite(lastKnownTime) && lastKnownTime >= 0
        ? lastKnownTime
        : 0;
    const frozenTime = heldTime != null && Number.isFinite(heldTime) && heldTime >= 0
        ? heldTime
        : 0;
    return Math.max(mediaTime, knownTime, frozenTime);
}

/** Whether the range containing `time` has enough data to safely resume. */
export function hasBufferedDataAhead(
    ranges: TimeRanges,
    time: number,
    minimumAheadSeconds = 0.5,
    duration = Number.POSITIVE_INFINITY,
): boolean {
    if (!Number.isFinite(time) || time < 0) return false;

    const requiredEnd = Number.isFinite(duration) && duration > 0
        ? Math.min(time + minimumAheadSeconds, duration)
        : time + minimumAheadSeconds;

    for (let index = 0; index < ranges.length; index += 1) {
        const start = ranges.start(index);
        const end = ranges.end(index);
        if (time >= start - 0.1 && time <= end + 0.1 && end >= requiredEnd - 0.1) {
            return true;
        }
    }
    return false;
}

export function hasCompleteMediaMetadata(readyState: number, duration: number): boolean {
    return readyState >= 1 && Number.isFinite(duration) && duration > 0;
}

export function getRecoveryDelayMs(
    attempt: number,
    baseDelayMs = 1000,
    maximumDelayMs = 15_000,
): number {
    const exponent = Math.max(0, Math.min(10, Math.floor(attempt) - 1));
    return Math.min(maximumDelayMs, baseDelayMs * (2 ** exponent));
}

export function calculateThroughputKbps(
    latestBytes: number,
    previousBytes: number,
    elapsedMs: number,
): number {
    if (elapsedMs <= 0 || latestBytes <= previousBytes) return 0;
    return Math.round(((latestBytes - previousBytes) * 8) / elapsedMs);
}
