import type { AlignedPair, Alignment, MatchMode } from "./types.ts";

export const MATCH_TOLERANCE_SEMITONES = 0.5;
export const GAP_COST = 0.8;
const MATCH_WEIGHT = 0.1;

function subCost(delta: number): [number, boolean] {
    const a = Math.abs(delta);
    if (a <= MATCH_TOLERANCE_SEMITONES) {
        return [MATCH_WEIGHT * a, true];
    }
    return [1.0, false];
}

export function foldOctave(deltaSemitones: number): number {
    return deltaSemitones - 12.0 * Math.round(deltaSemitones / 12.0);
}

export function align(
    target: readonly number[],
    detected: readonly number[],
    transpose = 0.0,
    octaveInvariant = true,
): Alignment {
    const t = target.map(x => x + transpose);
    const d = detected.slice();
    const n = t.length;
    const m = d.length;

    const dp = new Float64Array((n + 1) * (m + 1));
    const back = new Int8Array((n + 1) * (m + 1)); // 0=diag 1=up(del) 2=left(ins)

    function ix(i: number, j: number) {
        return i * (m + 1) + j;
    }

    for (let i = 0; i <= n; i++) dp[ix(i, 0)] = i * GAP_COST;
    for (let j = 0; j <= m; j++) dp[ix(0, j)] = j * GAP_COST;
    for (let i = 1; i <= n; i++) back[ix(i, 0)] = 1;
    for (let j = 1; j <= m; j++) back[ix(0, j)] = 2;

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const rawDelta = d[j - 1]! - t[i - 1]!;
            const delta = octaveInvariant ? foldOctave(rawDelta) : rawDelta;
            const [scost] = subCost(delta);
            const cDiag = dp[ix(i - 1, j - 1)]! + scost;
            const cUp = dp[ix(i - 1, j)]! + GAP_COST;
            const cLeft = dp[ix(i, j - 1)]! + GAP_COST;
            
            const best = Math.min(cDiag, cUp, cLeft);
            dp[ix(i, j)] = best;
            back[ix(i, j)] = best === cDiag ? 0 : (best === cUp ? 1 : 2);
        }
    }

    const pairs: AlignedPair[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        const move = back[ix(i, j)]!;
        if (i > 0 && j > 0 && move === 0) {
            const rawDelta = d[j - 1]! - t[i - 1]!;
            const delta = octaveInvariant ? foldOctave(rawDelta) : rawDelta;
            const [, isMatch] = subCost(delta);
            pairs.push({
                op: isMatch ? "match" : "sub",
                targetIndex: i - 1,
                detectedIndex: j - 1,
                deltaSemitones: delta,
            });
            i--;
            j--;
        } else if (i > 0 && (move === 1 || j === 0)) {
            pairs.push({ op: "del", targetIndex: i - 1, detectedIndex: null, deltaSemitones: null });
            i--;
        } else {
            pairs.push({ op: "ins", targetIndex: null, detectedIndex: j - 1, deltaSemitones: null });
            j--;
        }
    }
    pairs.reverse();

    return {
        pairs,
        cost: dp[ix(n, m)]!,
        transposeSemitones: transpose,
        mode: transpose === 0 ? "absolute" : "relative",
        nTarget: n,
        nDetected: m,
    };
}

export function bestAlignment(
    target: readonly number[],
    detected: readonly number[],
    mode: MatchMode = "absolute",
    maxTranspose = 12,
    octaveInvariant = true,
): Alignment {
    if (mode === "absolute" || target.length === 0 || detected.length === 0) {
        const result = align(target, detected, 0.0, octaveInvariant);
        result.mode = mode;
        return result;
    }

    const offsets: number[] = [];
    for (let i = 0; i < Math.min(target.length, detected.length); i++) {
        const raw = detected[i]! - target[i]!;
        offsets.push(octaveInvariant ? foldOctave(raw) : raw);
    }
    offsets.sort((a, b) => a - b);
    const seed = offsets[Math.floor(offsets.length / 2)]!;
    const seedInt = Math.round(seed);

    const order: number[] = [];
    for (let k = -maxTranspose; k <= maxTranspose; k++) {
        order.push(k);
    }
    order.sort((a, b) => {
        const d1 = Math.abs(a - seedInt) - Math.abs(b - seedInt);
        if (d1 !== 0) return d1;
        return Math.abs(a) - Math.abs(b);
    });

    let best: Alignment | null = null;
    for (const k of order) {
        const cand = align(target, detected, k, octaveInvariant);
        if (!best || cand.cost < best.cost - 1e-9) {
            best = cand;
        } else if (Math.abs(cand.cost - best.cost) <= 1e-9 && Math.abs(k) < Math.abs(best.transposeSemitones)) {
            best = cand;
        }
    }

    best!.mode = mode;
    return best!;
}

export function residualOffsetCents(alignment: Alignment): number {
    const deltas: number[] = [];
    for (const p of alignment.pairs) {
        if (p.op === "match" && p.deltaSemitones !== null) {
            deltas.push(p.deltaSemitones);
        }
    }
    if (deltas.length === 0) {
        return 0.0;
    }
    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)]!;
    return median * 100.0;
}
