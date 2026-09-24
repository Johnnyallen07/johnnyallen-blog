/**
 * Synthesis of violin-like audio.
 *
 * Two jobs:
 *
 * 1. **Render prompts.** Until a real sampled violin library exists, generated
 *    licks need a voice. Additive synthesis with a violin-ish harmonic profile is
 *    not going to fool anyone, but it is copyright-clean and it exercises the
 *    whole pipeline.
 *
 * 2. **Fabricate performances.** This is the more important one. Being able to
 *    synthesise an *attempt* -- with known intonation errors, known timing
 *    jitter, known noise and reverb -- means the scoring engine can be tested
 *    end-to-end against ground truth long before a single real recording has been
 *    made. Every scoring test in this repo is built on it.
 *
 * The synthesis deliberately includes the things that break naive pitch trackers:
 * a noisy bow attack, vibrato, and optional portamento. If the tracker only works
 * on clean sine waves, we want to find that out here.
 *
 * Note on random noise: TypeScript and Python randomness streams differ by necessity.
 * We use Mulberry32 here for deterministic noise within the TS port. Same seed
 * yields identical outputs.
 */

import { DEFAULT_A4_HZ, midiToHz, SCALE_INTERVALS } from "./theory.ts";
import type { Mode } from "./theory.ts";
import type { Lick } from "./types.ts";

export const DEFAULT_SR = 48000;

/**
 * Relative amplitude of each harmonic. A real violin is richer than this, but
 * the important property is reproduced: partials 2 and 3 are strong enough that
 * an unguarded autocorrelation tracker will happily report the wrong octave.
 */
const HARMONIC_PROFILE = new Float64Array([
    1.00, 0.72, 0.55, 0.38, 0.30, 0.22, 0.17, 0.12, 0.09, 0.07, 0.05, 0.04
]);

export interface SynthConfig {
    sr: number;
    attackS: number;
    releaseS: number;
    /**
     * Fraction of the note's nominal length actually sounded; the remainder is
     * silence, which is what gives the tracker a gap to segment on.
     */
    duty: number;
    vibratoHz: number;
    vibratoCents: number;
    /** Vibrato does not start instantly; players ease into it. */
    vibratoOnsetS: number;
    /** Amplitude of the bow-attack noise transient, relative to the note. */
    bowNoise: number;
    amplitude: number;
}

export const DEFAULT_SYNTH_CONFIG: SynthConfig = {
    sr: DEFAULT_SR,
    attackS: 0.045,
    releaseS: 0.060,
    duty: 0.92,
    vibratoHz: 5.5,
    vibratoCents: 0.0,
    vibratoOnsetS: 0.12,
    bowNoise: 0.10,
    amplitude: 0.25,
};

function adsr(n: number, sr: number, attackS: number, releaseS: number): Float64Array {
    /** Simple attack/sustain/release envelope, clipped to fit short notes. */
    const a = Math.min(Math.trunc(attackS * sr), Math.max(1, Math.trunc(n / 3)));
    const r = Math.min(Math.trunc(releaseS * sr), Math.max(1, Math.trunc(n / 3)));
    const s = Math.max(0, n - a - r);

    const out = new Float64Array(n);
    for (let i = 0; i < a; i++) {
        out[i] = Math.pow(i / a, 1.5);
    }
    for (let i = 0; i < s; i++) {
        out[a + i] = 1.0;
    }
    for (let i = 0; i < r; i++) {
        out[a + s + i] = Math.pow(1.0 - i / r, 1.5);
    }
    return out;
}

/**
 * Mulberry32 PRNG.
 */
function mulberry32(a: number): () => number {
    return function() {
        let t = (a += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getNormalGenerator(seed: number): () => number {
    const rng = mulberry32(seed);
    return function() {
        let u = 0, v = 0;
        while (u === 0) u = rng(); 
        while (v === 0) v = rng();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
}

export interface SynthNoteOptions {
    /** Constant detuning, i.e. the intonation error to simulate. */
    centsOffset?: number;
    /** A slide into the note, decaying over the first ~120ms. */
    portamentoCents?: number;
    /** Concert pitch reference. */
    a4Hz?: number;
}

/**
 * Render a single note.
 */
export function synthNote(
    midi: number,
    durationS: number,
    cfg: SynthConfig = DEFAULT_SYNTH_CONFIG,
    options: SynthNoteOptions = {}
): Float32Array {
    const centsOffset = options.centsOffset ?? 0.0;
    const portamentoCents = options.portamentoCents ?? 0.0;
    const a4Hz = options.a4Hz ?? DEFAULT_A4_HZ;

    const n = Math.max(1, Math.trunc(durationS * cfg.sr));
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = i / cfg.sr;

    const detune = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        detune[i] = centsOffset;
        if (portamentoCents) {
            detune[i] = detune[i]! + portamentoCents * Math.exp(-t[i]! / 0.04);
        }
        if (cfg.vibratoCents) {
            const ramp = Math.max(0.0, Math.min(1.0, (t[i]! - cfg.vibratoOnsetS) / 0.15));
            detune[i] = detune[i]! + cfg.vibratoCents * ramp * Math.sin(2 * Math.PI * cfg.vibratoHz * t[i]!);
        }
    }

    const f0 = new Float64Array(n);
    let maxF0 = 0;
    for (let i = 0; i < n; i++) {
        f0[i] = midiToHz(midi + detune[i]! / 100.0, a4Hz);
        if (f0[i]! > maxF0) maxF0 = f0[i]!;
    }

    // Integrate instantaneous frequency to get phase
    const phase = new Float64Array(n);
    let sumF0 = 0;
    for (let i = 0; i < n; i++) {
        sumF0 += f0[i]!;
        phase[i] = (2 * Math.PI * sumF0) / cfg.sr;
    }

    const out = new Float64Array(n);
    const nyquist = cfg.sr / 2.0;

    let sumProfile = 0;
    for (let kIndex = 0; kIndex < HARMONIC_PROFILE.length; kIndex++) {
        const k = kIndex + 1;
        const amp = HARMONIC_PROFILE[kIndex]!;
        if (maxF0 * k >= nyquist) break;
        sumProfile += amp;
        for (let i = 0; i < n; i++) {
            out[i] = out[i]! + amp * Math.sin(k * phase[i]!);
        }
    }

    for (let i = 0; i < n; i++) out[i] = out[i]! / (sumProfile);

    const env = adsr(n, cfg.sr, cfg.attackS, cfg.releaseS);
    for (let i = 0; i < n; i++) out[i] = out[i]! * env[i]!;

    if (cfg.bowNoise > 0) {
        const seed = Math.trunc(Math.abs(midi) * 1000) % 2147483648;
        const randNormal = getNormalGenerator(seed);
        const burstN = Math.min(n, Math.trunc(0.03 * cfg.sr));
        for (let i = 0; i < burstN; i++) {
            const burst = randNormal() * Math.exp(-i / (0.008 * cfg.sr));
            out[i] = out[i]! + cfg.bowNoise * burst;
        }
    }

    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        result[i] = out[i]! * cfg.amplitude;
    }
    return result;
}

export interface RenderLickOptions {
    centsErrors?: readonly number[];
    timingJitterS?: readonly number[];
    tempoScale?: number;
    leadInS?: number;
    tailS?: number;
    a4Hz?: number;
}

/**
 * Render a whole lick, optionally as a flawed human performance.
 */
export function renderLick(
    lick: Lick,
    cfg: SynthConfig = DEFAULT_SYNTH_CONFIG,
    options: RenderLickOptions = {}
): Float32Array {
    const centsErrors = options.centsErrors;
    const timingJitterS = options.timingJitterS;
    const tempoScale = options.tempoScale ?? 1.0;
    const leadInS = options.leadInS ?? 0.25;
    const tailS = options.tailS ?? 0.35;
    const a4Hz = options.a4Hz ?? DEFAULT_A4_HZ;

    const nNotes = lick.notes.length;
    if (centsErrors && centsErrors.length !== nNotes) {
        throw new Error(`centsErrors has ${centsErrors.length} entries, need ${nNotes}`);
    }
    if (timingJitterS && timingJitterS.length !== nNotes) {
        throw new Error(`timingJitterS has ${timingJitterS.length} entries, need ${nNotes}`);
    }

    const spb = 1 / (lick.tempoBpm / 60);
    const durs = lick.notes.map(n => n.beats * spb * tempoScale);
    
    let currentOnset = 0;
    let onsets = lick.notes.map((_, i) => {
        const o = currentOnset;
        if (i < durs.length) currentOnset += lick.notes[i]!.beats * spb;
        return o * tempoScale + leadInS;
    });

    if (timingJitterS) {
        onsets = onsets.map((o, i) => Math.max(0.0, o + timingJitterS[i]!));
    }

    let totalS = 0;
    for (let i = 0; i < onsets.length; i++) {
        const endS = onsets[i]! + durs[i]!;
        if (endS > totalS) totalS = endS;
    }
    totalS += tailS;

    const bufLen = Math.trunc(totalS * cfg.sr) + 1;
    const buf = new Float32Array(bufLen);

    for (let i = 0; i < lick.notes.length; i++) {
        const note = lick.notes[i]!;
        const cents = centsErrors ? centsErrors[i]! : 0.0;
        const audio = synthNote(
            note.midi,
            durs[i]! * cfg.duty,
            cfg,
            { centsOffset: cents, a4Hz }
        );
        const start = Math.trunc(onsets[i]! * cfg.sr);
        const end = Math.min(start + audio.length, buf.length);
        for (let j = start; j < end; j++) {
            buf[j] = buf[j]! + audio[j - start]!;
        }
    }

    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
        const abs = Math.abs(buf[i]!);
        if (abs > peak) peak = abs;
    }

    if (peak > 0.99) {
        const scale = 0.99 / peak;
        for (let i = 0; i < buf.length; i++) {
            buf[i] = buf[i]! * scale;
        }
    }

    return buf;
}

// --------------------------------------------------------------------------
// Degradation -- the acoustic reality of a bedroom
// --------------------------------------------------------------------------

/** Add white noise at a given signal-to-noise ratio. */
export function addNoise(x: Float32Array, snrDb: number, seed: number = 0): Float32Array {
    let sigPower = 0;
    for (let i = 0; i < x.length; i++) {
        sigPower += x[i]! * x[i]!;
    }
    sigPower /= x.length;

    if (sigPower <= 0) return new Float32Array(x);

    const noisePower = sigPower / Math.pow(10, snrDb / 10.0);
    const noiseStd = Math.sqrt(noisePower);
    const randNormal = getNormalGenerator(seed);

    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
        out[i] = x[i]! + randNormal() * noiseStd;
    }
    return out;
}

function radix2Fft(re: Float64Array, im: Float64Array, inv: boolean): void {
    const n = re.length;
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            const tr = re[j]!, ti = im[j]!;
            re[j] = re[i]!; im[j] = im[i]!;
            re[i] = tr; im[i] = ti;
        }
        let k = n >> 1;
        while (k <= j) {
            j -= k;
            k >>= 1;
        }
        j += k;
    }
    for (let l = 2; l <= n; l <<= 1) {
        const half = l >> 1;
        const theta = (inv ? -2.0 : 2.0) * Math.PI / l;
        const wpr = Math.cos(theta);
        const wpi = Math.sin(theta);
        for (let i = 0; i < n; i += l) {
            let wr = 1.0, wi = 0.0;
            for (let m = 0; m < half; m++) {
                const idx1 = i + m;
                const idx2 = idx1 + half;
                const tr = re[idx2]! * wr - im[idx2]! * wi;
                const ti = re[idx2]! * wi + im[idx2]! * wr;
                re[idx2] = re[idx1]! - tr;
                im[idx2] = im[idx1]! - ti;
                re[idx1] = re[idx1]! + tr;
                im[idx1] = im[idx1]! + ti;

                const nw_r = wr * wpr - wi * wpi;
                const nw_i = wr * wpi + wi * wpr;
                wr = nw_r; wi = nw_i;
            }
        }
    }
    if (inv) {
        for (let i = 0; i < n; i++) {
            re[i] = re[i]! / (n);
        }
    }
}

/**
 * Convolve with a synthetic exponentially-decaying reverb tail.
 *
 * Direct convolution of a several-second phrase takes ~2.5s in JS, which is too
 * slow. We use a small radix-2 FFT to drop that to ~60ms.
 */
export function addRoom(x: Float32Array, rt60S: number = 0.35, sr: number = DEFAULT_SR, seed: number = 0): Float32Array {
    if (rt60S <= 0) return new Float32Array(x);
    const rng = getNormalGenerator(seed);
    const n = Math.trunc(rt60S * sr);
    const ir = new Float64Array(n);
    let irSqSum = 0;

    for (let i = 0; i < n; i++) {
        ir[i] = rng() * Math.exp(-6.9 * i / n);
        if (i === 0) ir[0] = ir[0]! + 8.0;
        irSqSum += ir[i]! * ir[i]!;
    }
    const irNorm = Math.sqrt(irSqSum);
    for (let i = 0; i < n; i++) {
        ir[i] = ir[i]! / (irNorm);
    }

    const nConv = x.length + n - 1;
    let fftSize = 1;
    while (fftSize < nConv) fftSize <<= 1;

    const xRe = new Float64Array(fftSize);
    const xIm = new Float64Array(fftSize);
    for (let i = 0; i < x.length; i++) xRe[i] = x[i]!;
    radix2Fft(xRe, xIm, false);

    const irRe = new Float64Array(fftSize);
    const irIm = new Float64Array(fftSize);
    for (let i = 0; i < n; i++) irRe[i] = ir[i]!;
    radix2Fft(irRe, irIm, false);

    const wetRe = new Float64Array(fftSize);
    const wetIm = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        const xr = xRe[i]!, xi = xIm[i]!;
        const rr = irRe[i]!, ri = irIm[i]!;
        wetRe[i] = xr * rr - xi * ri;
        wetIm[i] = xr * ri + xi * rr;
    }
    radix2Fft(wetRe, wetIm, true);

    const wet = new Float32Array(x.length);
    let peakWet = 0;
    for (let i = 0; i < x.length; i++) {
        wet[i] = wetRe[i]!;
        const abs = Math.abs(wet[i]!);
        if (abs > peakWet) peakWet = abs;
    }

    let peakX = 0;
    for (let i = 0; i < x.length; i++) {
        const abs = Math.abs(x[i]!);
        if (abs > peakX) peakX = abs;
    }

    if (peakWet > 0) {
        const scale = peakX / peakWet;
        for (let i = 0; i < x.length; i++) {
            wet[i] = wet[i]! * scale;
        }
    }
    return wet;
}

// --------------------------------------------------------------------------
// WAV I/O
// --------------------------------------------------------------------------

/**
 * Encode mono float samples as a 16-bit PCM WAV container.
 *
 * Known quirk from the python port: write_wav scales by 32767 while read_wav 
 * divides by 32768, a ~1 LSB gain asymmetry. This is preserved here.
 */
export function wavBytes(x: Float32Array, sr: number = DEFAULT_SR): Uint8Array {
    const dataBytes = x.length * 2;
    const buf = new Uint8Array(44 + dataBytes);
    const view = new DataView(buf.buffer);

    // RIFF chunk descriptor
    buf.set([82, 73, 70, 70], 0); // "RIFF"
    view.setUint32(4, 36 + dataBytes, true);
    buf.set([87, 65, 86, 69], 8); // "WAVE"

    // fmt sub-chunk
    buf.set([102, 109, 116, 32], 12); // "fmt "
    view.setUint32(16, 16, true); // Size of the fmt chunk
    view.setUint16(20, 1, true); // Audio format = 1 (PCM)
    view.setUint16(22, 1, true); // Num channels = 1
    view.setUint32(24, sr, true); // Sample rate
    view.setUint32(28, sr * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data sub-chunk
    buf.set([100, 97, 116, 97], 36); // "data"
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let i = 0; i < x.length; i++) {
        let val = x[i]!;
        if (val < -1.0) val = -1.0;
        else if (val > 1.0) val = 1.0;
        view.setInt16(offset, Math.trunc(val * 32767.0), true);
        offset += 2;
    }

    return buf;
}

/**
 * The short phrase played before an exercise to establish "this is Do".
 *
 * It arpeggiates the tonic triad — 1̂ 3̂ 5̂ 1̂ — rather than sounding a bare
 * fifth. This is not decoration. A bare 1̂–5̂ contains no third, and the third
 * is the *only* interval that distinguishes major from minor, so a fifth
 * cannot establish the mode it is supposed to be establishing. A learner asked
 * to sing "Mi" after hearing only Do and Sol is being asked to guess which
 * Mi.
 *
 * The third is taken from the mode's own interval set, so the minor rungs of
 * the key ladder announce themselves as minor.
 */
export function renderTonicCadence(
    tonicMidi: number,
    mode: Mode = "major",
    cfg: SynthConfig = DEFAULT_SYNTH_CONFIG,
): Float32Array {
    const intervals = SCALE_INTERVALS[mode] ?? SCALE_INTERVALS.major;
    const third = tonicMidi + (intervals[2] ?? 4);
    const fifth = tonicMidi + (intervals[4] ?? 7);

    const stepDur = 0.30;
    const finalDur = 0.62;
    const gap = 0.035;

    const voices = [
        synthNote(tonicMidi, stepDur, { ...cfg, amplitude: cfg.amplitude * 0.66 }),
        synthNote(third, stepDur, { ...cfg, amplitude: cfg.amplitude * 0.66 }),
        synthNote(fifth, stepDur, { ...cfg, amplitude: cfg.amplitude * 0.70 }),
        // Landing on the tonic an octave up and then settling back would be
        // prettier, but it doubles the wait before every single round.
        synthNote(tonicMidi, finalDur, { ...cfg, amplitude: cfg.amplitude * 0.88 }),
    ];

    const gapSamples = Math.trunc(gap * cfg.sr);
    const tailSamples = Math.trunc(0.22 * cfg.sr);

    let length = tailSamples;
    for (const voice of voices) length += voice.length + gapSamples;

    const out = new Float32Array(length);
    let cursor = 0;
    for (const voice of voices) {
        out.set(voice, cursor);
        cursor += voice.length + gapSamples;
    }
    return out;
}


/**
 * What establishes the pitch frame before an exercise.
 *
 * - `triad`: the tonic arpeggio (see `renderTonicCadence`). Most informative,
 *   but it asks the listener to already hear a triad as a triad.
 * - `tonic`: the tonic alone, held. For learners who cannot yet hear a fifth,
 *   a single sustained Do is something to hold on to rather than decode.
 * - `fixed`: always the same pitch (`fixedMidi`, e.g. A4) regardless of key —
 *   a tuning fork. The learner derives everything from one anchor they come
 *   to know by heart.
 */
export type ReferenceKind = "triad" | "tonic" | "fixed";

export interface ReferenceSpec {
    kind: ReferenceKind;
    /** Required for `fixed`. */
    fixedMidi?: number;
}

/** Sequential note events, each a single note or a chord, with a gap after each. */
export function renderEvents(
    events: readonly { midis: readonly number[]; durS: number; gapS?: number; gain?: number }[],
    cfg: SynthConfig = DEFAULT_SYNTH_CONFIG,
    tailS = 0.2,
): Float32Array {
    const rendered = events.map(ev => {
        const gain = (ev.gain ?? 1) / Math.sqrt(Math.max(1, ev.midis.length));
        const voices = ev.midis.map(m => synthNote(m, ev.durS, { ...cfg, amplitude: cfg.amplitude * gain }));
        const len = Math.max(1, ...voices.map(v => v.length));
        const mix = new Float32Array(len);
        for (const v of voices) for (let i = 0; i < v.length; i++) mix[i] = mix[i]! + v[i]!;
        return { mix, gap: Math.trunc((ev.gapS ?? 0.08) * cfg.sr) };
    });
    let length = Math.trunc(tailS * cfg.sr);
    for (const r of rendered) length += r.mix.length + r.gap;
    const out = new Float32Array(length);
    let cursor = 0;
    for (const r of rendered) {
        out.set(r.mix, cursor);
        cursor += r.mix.length + r.gap;
    }
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!));
    if (peak > 0.98) for (let i = 0; i < out.length; i++) out[i] = out[i]! * (0.98 / peak);
    return out;
}

/** The reference alone, as played before a round and by the 🔔 replay button. */
export function renderReference(
    tonicMidi: number,
    mode: Mode,
    reference: ReferenceSpec,
    cfg: SynthConfig = DEFAULT_SYNTH_CONFIG,
): Float32Array {
    if (reference.kind === "tonic") {
        return renderEvents([{ midis: [tonicMidi], durS: 1.1, gain: 0.85 }], cfg, 0.3);
    }
    if (reference.kind === "fixed" && reference.fixedMidi !== undefined) {
        return renderEvents([{ midis: [reference.fixedMidi], durS: 1.1, gain: 0.85 }], cfg, 0.3);
    }
    return renderTonicCadence(tonicMidi, mode, cfg);
}

/**
 * Renders the audio prompt for a Foundation Mode round:
 * - `full_demo`: Reference + full melody (+ optional low tonic drone).
 * - `cadence_and_first_note`: Reference + starting note ONLY (for Sight-Singing).
 * - `cadence_and_mystery_note`: Reference + the single mystery note ONLY (for Sing-It-Home).
 */
export function renderFoundationPrompt(
    options: {
        tonicMidi: number;
        mode?: Mode;
        cueMidi: number;
        targetLick: Lick;
        promptAudioMode: "full_demo" | "cadence_and_first_note" | "cadence_and_mystery_note";
        tempoScale?: number;
        withDrone?: boolean;
        reference?: ReferenceSpec;
    },
    cfg: SynthConfig = DEFAULT_SYNTH_CONFIG,
): Float32Array {
    const reference = options.reference ?? { kind: "triad" };
    let cadence: Float32Array = renderReference(options.tonicMidi, options.mode ?? "major", reference, cfg);
    // Sing-It-Home is defined relative to Do. A fixed anchor on its own leaves
    // that undefined, so the tonic follows it.
    if (reference.kind === "fixed" && options.promptAudioMode === "cadence_and_mystery_note") {
        const tonic = renderEvents([{ midis: [options.tonicMidi], durS: 0.8, gain: 0.85 }], cfg, 0.25);
        const joined = new Float32Array(cadence.length + tonic.length);
        joined.set(cadence, 0);
        joined.set(tonic, cadence.length);
        cadence = joined;
    }
    const tempoScale = options.tempoScale ?? 1.0;

    let body: Float32Array;
    if (
        options.promptAudioMode === "cadence_and_first_note" ||
        options.promptAudioMode === "cadence_and_mystery_note"
    ) {
        const singleLick: Lick = {
            ...options.targetLick,
            notes: [{ midi: options.cueMidi, beats: 1.8 }],
        };
        body = renderLick(singleLick, cfg, { tempoScale });
    } else {
        body = renderLick(options.targetLick, cfg, { tempoScale });
    }

    if (options.withDrone) {
        const droneDur = body.length / cfg.sr;
        // An octave under the tonic, unless that would fall below G3: a male
        // register tonic is already low, and C2 is inaudible on a laptop.
        const droneMidi = options.tonicMidi - 12 >= 55 ? options.tonicMidi - 12 : options.tonicMidi;
        const drone = synthNote(droneMidi, droneDur, {
            ...cfg,
            attackS: 0.15,
            releaseS: 0.25,
            bowNoise: 0.0,
            amplitude: cfg.amplitude * 0.22,
        });
        for (let i = 0; i < Math.min(body.length, drone.length); i++) {
            body[i] = Math.max(-0.98, Math.min(0.98, body[i]! + drone[i]!));
        }
    }

    const total = new Float32Array(cadence.length + body.length);
    total.set(cadence, 0);
    total.set(body, cadence.length);
    return total;
}

