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

export function getFarthestBufferedEnd(buffered: TimeRanges): number {
    let farthestEnd = 0;
    for (let index = 0; index < buffered.length; index += 1) {
        farthestEnd = Math.max(farthestEnd, buffered.end(index));
    }
    return farthestEnd;
}

export function calculateBufferedPercent(buffered: TimeRanges, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return clampPercent((getFarthestBufferedEnd(buffered) / duration) * 100);
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

export function calculateBufferedBytes(
    buffered: TimeRanges,
    duration: number,
    fileSize: number,
): number {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fileSize) || fileSize <= 0) {
        return 0;
    }
    return Math.round((getFarthestBufferedEnd(buffered) / duration) * fileSize);
}

export function calculateThroughputKbps(
    latestBytes: number,
    previousBytes: number,
    elapsedMs: number,
): number {
    if (elapsedMs <= 0 || latestBytes <= previousBytes) return 0;
    return Math.round(((latestBytes - previousBytes) * 8) / elapsedMs);
}
