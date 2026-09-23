import {
    VIOLIN_MIN_HZ,
    VIOLIN_MAX_HZ,
    hzToMidi,
    midiToHz,
} from "./theory.ts";
import type { PitchDetector, PitchTrack } from "./types.ts";

export interface YinOptions {
    frameS: number;
    hopS: number;
    threshold: number;
    minHz: number;
    maxHz: number;
    silenceDb: number;
    octaveGuard: boolean;
}

const DEFAULT_OPTIONS: YinOptions = {
    frameS: 0.0427, // ~2048 samples at 48 kHz
    hopS: 0.010, // 10 ms
    threshold: 0.12, // Using 0.12 from tuner.ts instead of 0.15 from python because it provides stricter periodicity, reducing false positives on noisy attacks.
    minHz: VIOLIN_MIN_HZ,
    maxHz: VIOLIN_MAX_HZ,
    silenceDb: -45.0,
    octaveGuard: true,
};

export function medianFilter1d(arr: Float64Array, size: number): Float64Array {
    if (size <= 1 || arr.length === 0) return new Float64Array(arr);
    
    const out = new Float64Array(arr.length);
    out.fill(Number.NaN);
    
    const half = Math.floor(size / 2);
    
    // To match np.pad(..., mode="edge")
    const getClamped = (idx: number) => {
        if (idx < 0) return arr[0]!;
        if (idx >= arr.length) return arr[arr.length - 1]!;
        return arr[idx]!;
    };

    for (let i = 0; i < arr.length; i++) {
        const window: number[] = [];
        for (let j = -half; j < size - half; j++) {
            const val = getClamped(i + j);
            if (!Number.isNaN(val)) {
                window.push(val);
            }
        }
        if (window.length > 0) {
            window.sort((a, b) => a - b);
            const mid = Math.floor(window.length / 2);
            out[i] = window.length % 2 === 0 ? (window[mid - 1]! + window[mid]!) / 2 : window[mid]!;
        }
    }
    return out;
}

function fixOctaveJumps(midi: Float64Array, voiced: boolean[], medianSize = 11, tolSemitones = 1.5): Float64Array {
    let out = new Float64Array(midi);
    for (let pass = 0; pass < 2; pass++) {
        const refMidi = new Float64Array(out.length);
        for (let i = 0; i < out.length; i++) {
            refMidi[i] = voiced[i] ? out[i]! : Number.NaN;
        }
        const ref = medianFilter1d(refMidi, medianSize);
        
        let changedAny = false;
        const nextOut = new Float64Array(out);
        for (let i = 0; i < out.length; i++) {
            if (!voiced[i] || Number.isNaN(ref[i]!)) continue;
            
            const v = out[i]!;
            const r = ref[i]!;
            const delta = v - r;
            
            if (Math.abs(delta - 12.0) < tolSemitones) {
                nextOut[i] = v - 12.0;
                changedAny = true;
            } else if (Math.abs(delta + 12.0) < tolSemitones) {
                nextOut[i] = v + 12.0;
                changedAny = true;
            }
        }
        if (!changedAny) break;
        out = nextOut;
    }
    return out;
}

function interpolateTau(values: Float32Array, tau: number): number {
    const left = values[tau - 1]!;
    const center = values[tau]!;
    const right = values[tau + 1]!;
    const divisor = left + right - 2 * center;
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.000001) return tau;
    const shift = (left - right) / (2 * divisor);
    return tau + Math.max(-1.0, Math.min(1.0, shift));
}

function estimatePitch(frame: Float32Array, sampleRate: number, minTau: number, maxTau: number, threshold: number, minFrequency: number, maxFrequency: number): { frequency: number, confidence: number, rms: number } {
    let sumSquares = 0;
    for (let index = 0; index < frame.length; index += 1) {
        sumSquares += frame[index]! * frame[index]!;
    }
    const rms = Math.sqrt(sumSquares / frame.length);
    if (rms === 0) {
        return { frequency: 0, confidence: 0, rms: 0 };
    }

    // DC removal over the frame to prevent flat dragging (matching python)
    let sum = 0;
    for (let index = 0; index < frame.length; index += 1) {
        sum += frame[index]!;
    }
    const mean = sum / frame.length;
    
    // Instead of allocating a new frame, we can just subtract the mean on the fly
    // but calculating YIN difference requires multiple passes, easier to build a dc-blocked array
    const blockedFrame = new Float32Array(frame.length);
    for (let index = 0; index < frame.length; index += 1) {
        blockedFrame[index] = frame[index]! - mean;
    }

    const yin = new Float32Array(maxTau + 1);

    const integrationWindow = blockedFrame.length - maxTau;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        let difference = 0;
        for (let index = 0; index < integrationWindow; index += 1) {
            const delta = blockedFrame[index]! - blockedFrame[index + tau]!;
            difference += delta * delta;
        }
        yin[tau] = difference;
    }

    yin[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        runningSum += yin[tau]!;
        yin[tau] = runningSum === 0 ? 1 : (yin[tau]! * tau) / runningSum;
    }

    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
        if (yin[tau]! < threshold) {
            // Walk to the bottom of this dip rather than taking its leading edge.
            while (tau + 1 <= maxTau && yin[tau + 1]! < yin[tau]!) tau += 1;
            tauEstimate = tau;
            break;
        }
    }

    if (tauEstimate === -1) {
        let bestTau = minTau;
        for (let tau = minTau + 1; tau <= maxTau; tau += 1) {
            if (yin[tau]! < yin[bestTau]!) bestTau = tau;
        }
        tauEstimate = bestTau;
    }
    
    // Refine using parabolic interpolation
    const exactTau = interpolateTau(yin, tauEstimate);
    if (exactTau <= 0) {
        return { frequency: 0, confidence: 0, rms };
    }

    const frequency = sampleRate / exactTau;
    if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) {
        return { frequency: 0, confidence: 0, rms };
    }

    return {
        frequency,
        confidence: Math.max(0, Math.min(1, 1 - yin[tauEstimate]!)),
        rms,
    };
}


export function createYinPitchDetector(opts: Partial<YinOptions> = {}): PitchDetector {
    const config = { ...DEFAULT_OPTIONS, ...opts };

    return (samples: Float32Array, sampleRate: number): PitchTrack => {
        if (config.maxHz >= sampleRate / 2.0) {
            throw new Error(`sample rate ${sampleRate} cannot resolve frequencies up to ${config.maxHz} Hz (Nyquist is ${Math.floor(sampleRate / 2)} Hz)`);
        }

        const frameLen = Math.max(256, Math.floor(config.frameS * sampleRate));
        const hopLen = Math.max(1, Math.floor(config.hopS * sampleRate));

        const minTau = Math.max(2, Math.floor(sampleRate / config.maxHz));
        const maxTau = Math.min(Math.floor(frameLen / 2), Math.floor(sampleRate / config.minHz) + 2);

        if (maxTau <= minTau) {
            throw new Error(`sample rate ${sampleRate} cannot resolve ${config.minHz}-${config.maxHz} Hz with a ${frameLen}-sample frame`);
        }
        
        // Zero pad tail
        let paddedSamples = samples;
        if (samples.length < frameLen) {
            paddedSamples = new Float32Array(frameLen);
            paddedSamples.set(samples);
        }

        const nFrames = 1 + Math.floor((paddedSamples.length - frameLen) / hopLen);
        const times = new Float64Array(nFrames);
        const f0Hz = new Float64Array(nFrames);
        const voiced = new Array<boolean>(nFrames).fill(false);
        const confidence = new Float64Array(nFrames);
        const rms = new Float64Array(nFrames);

        let peakRms = 0;

        for (let i = 0; i < nFrames; i++) {
            const start = i * hopLen;
            const frame = paddedSamples.subarray(start, start + frameLen);
            
            times[i] = (start + frameLen / 2.0) / sampleRate;

            const res = estimatePitch(frame, sampleRate, minTau, maxTau, config.threshold, config.minHz, config.maxHz);
            f0Hz[i] = res.frequency;
            confidence[i] = res.confidence;
            rms[i] = res.rms;
            if (res.rms > peakRms) {
                peakRms = res.rms;
            }
        }

        const floor = peakRms * Math.pow(10, config.silenceDb / 20.0);
        let anyVoiced = false;

        for (let i = 0; i < nFrames; i++) {
            const isVoiced = f0Hz[i]! > 0 && rms[i]! > floor && (1.0 - confidence[i]!) < 0.5;
            voiced[i] = isVoiced;
            if (isVoiced) {
                anyVoiced = true;
            } else {
                f0Hz[i] = 0;
            }
        }

        if (config.octaveGuard && anyVoiced) {
            const midi = new Float64Array(nFrames);
            for (let i = 0; i < nFrames; i++) {
                midi[i] = voiced[i] ? hzToMidi(Math.max(f0Hz[i]!, 1.0)) : Number.NaN;
            }
            
            const fixed = fixOctaveJumps(midi, voiced);
            
            for (let i = 0; i < nFrames; i++) {
                if (voiced[i] && !Number.isNaN(fixed[i]!)) {
                    const diff = Math.abs(fixed[i]! - midi[i]!);
                    if (diff > 0.1) {
                        f0Hz[i] = midiToHz(fixed[i]!);
                    }
                }
            }
        }

        return {
            times,
            f0Hz,
            voiced,
            confidence,
            rms,
            sampleRate,
            hopS: hopLen / sampleRate
        };
    };
}
