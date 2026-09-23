import test from "node:test";
import assert from "node:assert/strict";
import { createYinPitchDetector } from "./pitchtrack.ts";
import { midiToHz, hzToMidi } from "./theory.ts";

function generateTone(midi, durationS, sampleRate, harmonics = []) {
    const n = Math.floor(durationS * sampleRate);
    const out = new Float32Array(n);
    const f0 = midiToHz(midi);
    
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        let val = Math.sin(2 * Math.PI * f0 * t);
        for (const { ratio, amp } of harmonics) {
            val += amp * Math.sin(2 * Math.PI * f0 * ratio * t);
        }
        out[i] = val;
    }
    return out;
}

test("Accuracy sweep 55..100", () => {
    const sampleRate = 48000;
    const detector = createYinPitchDetector({ frameS: 0.0427, hopS: 0.01 });
    
    let totalFrames = 0;
    let totalTimeMs = 0;
    
    const errors = [];
    
    for (let midi = 55; midi <= 100; midi++) {
        // pure sine plus a couple of harmonics
        const signal = generateTone(midi, 0.5, sampleRate, [{ ratio: 2, amp: 0.3 }, { ratio: 3, amp: 0.1 }]);
        
        const start = performance.now();
        const track = detector(signal, sampleRate);
        const end = performance.now();
        
        totalFrames += track.times.length;
        totalTimeMs += (end - start);
        
        for (let i = 0; i < track.times.length; i++) {
            if (track.voiced[i]) {
                const detectedMidi = hzToMidi(track.f0Hz[i]);
                errors.push(Math.abs(detectedMidi - midi) * 100); // cent error
            }
        }
    }
    
    errors.sort((a, b) => a - b);
    const medianError = errors[Math.floor(errors.length / 2)];
    
    console.log(`Median tracking error: ${medianError.toFixed(4)} cents`);
    console.log(`Tracking speed: ${(totalTimeMs / totalFrames).toFixed(3)} ms/frame`);
    
    assert.ok(medianError < 1.0, `Error ${medianError} is too high`);
});

test("Octave robustness", () => {
    const sampleRate = 48000;
    const detector = createYinPitchDetector();
    
    const midi = 67; // G4
    // 2nd harmonic stronger than fundamental
    const signal = generateTone(midi, 0.5, sampleRate, [{ ratio: 2, amp: 1.5 }]);
    
    const track = detector(signal, sampleRate);
    
    let voicedFrames = 0;
    for (let i = 0; i < track.times.length; i++) {
        if (track.voiced[i]) {
            voicedFrames++;
            const detectedMidi = hzToMidi(track.f0Hz[i]);
            assert.ok(Math.abs(detectedMidi - midi) < 0.5, `Detected ${detectedMidi} instead of fundamental ${midi}`);
        }
    }
    assert.ok(voicedFrames > 10, "Should have tracked the note");
});
