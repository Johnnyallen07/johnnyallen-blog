export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const MAX_BEATS_PER_BAR = 12;

export interface MetronomeClick {
    /** AudioContext time (seconds) the click should sound. */
    time: number;
    /** Beat index within the bar, 0-based. */
    beat: number;
    /** True on the downbeat (beat 0). */
    accent: boolean;
}

export interface ScheduleCursor {
    /** AudioContext time of the next click still to be scheduled. */
    nextNoteTime: number;
    /** Beat index of that next click. */
    beat: number;
}

export function clampBpm(bpm: number): number {
    if (!Number.isFinite(bpm)) return 120;
    return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

export function clampBeatsPerBar(beats: number): number {
    if (!Number.isFinite(beats)) return 4;
    return Math.max(1, Math.min(MAX_BEATS_PER_BAR, Math.round(beats)));
}

export function secondsPerBeat(bpm: number): number {
    return 60 / clampBpm(bpm);
}

/**
 * Lookahead scheduler step (Chris Wilson's "two clocks" pattern): emit every
 * click between the cursor and `untilTime`, returning the advanced cursor.
 * Pure so the beat math can be unit-tested without Web Audio.
 */
export function advanceSchedule(
    cursor: ScheduleCursor,
    untilTime: number,
    bpm: number,
    beatsPerBar: number,
): { clicks: MetronomeClick[]; cursor: ScheduleCursor } {
    const interval = secondsPerBeat(bpm);
    const bars = clampBeatsPerBar(beatsPerBar);
    const clicks: MetronomeClick[] = [];

    let { nextNoteTime, beat } = cursor;
    // Guard against pathological inputs producing an unbounded loop.
    let safety = 0;
    while (nextNoteTime <= untilTime && safety < 1024) {
        clicks.push({ time: nextNoteTime, beat, accent: beat === 0 });
        nextNoteTime += interval;
        beat = (beat + 1) % bars;
        safety += 1;
    }

    return { clicks, cursor: { nextNoteTime, beat } };
}

/**
 * Window (in AudioContext seconds) during which pitch analysis must be ignored
 * so a click — picked up acoustically by the mic — cannot corrupt detection.
 * `latencySeconds` should bundle output + input latency plus the analysis frame
 * length, since a click anywhere inside the frame pollutes the YIN estimate.
 */
export function blankWindowFor(clickTime: number, latencySeconds: number): { from: number; to: number } {
    const span = Math.max(0.08, latencySeconds);
    return { from: clickTime - 0.012, to: clickTime + span };
}
