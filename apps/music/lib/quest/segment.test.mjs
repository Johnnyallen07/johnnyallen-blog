import test from "node:test";
import assert from "node:assert/strict";
import { createYinPitchDetector } from "./pitchtrack.ts";
import { segmentNotes } from "./segment.ts";
import { midiToHz } from "./theory.ts";

function generateVibratoTone(midi, durationS, sampleRate, vibratoCents, vibratoHz) {
    const n = Math.floor(durationS * sampleRate);
    const out = new Float32Array(n);
    const baseF0 = midiToHz(midi);
    
    let phase = 0;
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const currentCents = vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t);
        const f0 = baseF0 * Math.pow(2, currentCents / 1200);
        phase += 2 * Math.PI * f0 / sampleRate;
        phase = phase % (2 * Math.PI);
        out[i] = Math.sin(phase);
    }
    return out;
}

function generateSlurredTone(midi1, midi2, durationS, sampleRate) {
    const n = Math.floor(durationS * sampleRate);
    const out = new Float32Array(n);
    const f0First = midiToHz(midi1);
    const f0Second = midiToHz(midi2);
    
    let phase = 0;
    for (let i = 0; i < n; i++) {
        // Switch pitch exactly in middle
        const f0 = i < n / 2 ? f0First : f0Second;
        phase += 2 * Math.PI * f0 / sampleRate;
        out[i] = Math.sin(phase);  
    }
    return out;
}

test("Vibrato segments as ONE note", () => {
    const sampleRate = 48000;
    const detector = createYinPitchDetector();
    
    const midi = 69; // A4
    const signal = generateVibratoTone(midi, 1.0, sampleRate, 35, 5); // 35 cents, 5 Hz
    const track = detector(signal, sampleRate);
    const events = segmentNotes(track);
    
    assert.equal(events.length, 1, `Expected 1 note, got ${events.length}`);
    
    const note = events[0];
    const centsError = Math.abs(note.midi - midi) * 100;
    assert.ok(centsError < 5.0, `Median cents error ${centsError.toFixed(2)} should be close to 0`);
});

test("Slurred notes segment as TWO notes", () => {
    const sampleRate = 48000;
    const detector = createYinPitchDetector();
    
    // Switch from A4 to B4 (69 -> 71)
    const signal = generateSlurredTone(69, 71, 1.0, sampleRate);
    const track = detector(signal, sampleRate);
    const events = segmentNotes(track);
    
    assert.equal(events.length, 2, `Expected 2 notes, got ${events.length}`);
    
    assert.ok(Math.abs(events[0].midi - 69) < 0.5, `First note ${events[0].midi} should be A4 (69)`);
    assert.ok(Math.abs(events[1].midi - 71) < 0.5, `Second note ${events[1].midi} should be B4 (71)`);
});
