import test from "node:test";
import assert from "node:assert";
import { synthNote, renderLick, wavBytes, addNoise, addRoom, DEFAULT_SYNTH_CONFIG } from "./synth.ts";
import { midiToHz } from "./theory.ts";

// Helper: Estimate frequency of a generated signal by counting zero-crossings
function estimateHz(samples, sr = 48000) {
    let crossings = 0;
    let firstCrossing = -1;
    let lastCrossing = -1;

    // To avoid noise around 0, we can use a slight hysteresis or just check sign changes on a clean signal
    for (let i = 1; i < samples.length; i++) {
        if (samples[i-1] <= 0 && samples[i] > 0) { // Positive zero-crossing
            if (firstCrossing === -1) {
                firstCrossing = i;
            }
            lastCrossing = i;
            crossings++;
        }
    }

    if (crossings < 2) return 0;
    // Number of periods is crossings - 1
    const totalSamples = lastCrossing - firstCrossing;
    const periodInSamples = totalSamples / (crossings - 1);
    return sr / periodInSamples;
}

function assertCents(hzA, hzB, tolerance = 3) {
    const cents = 1200 * Math.log2(hzA / hzB);
    assert.ok(Math.abs(cents) <= tolerance, `Pitches differ by ${cents.toFixed(1)} cents (expected $\\{hzB\\}, got $\\{hzA\\})`);
}

test("Rendering a lick produces correct sample count and no clipping", () => {
    const lick = {
        notes: [
            { midi: 60, beats: 1 },
            { midi: 62, beats: 0.5 },
            { midi: 64, beats: 0.5 }
        ],
        tempoBpm: 120, // 2 beats/sec, so 1 beat = 0.5s. Notes: 0.5s, 0.25s, 0.25s -> total 1s
        mode: "major",
        tonicMidi: 60,
        world: 1,
        seed: 42
    };

    // Lead-in = 0.25, tail = 0.35. Notes end at 1.0s. Total = 1.0 + 0.25 + 0.35 = 1.6s
    // 1.6s @ 48kHz = 76800. The code adds 1 to int(totalS * sr), so 76801
    const out = renderLick(lick);
    assert.equal(out.length, 76801);

    // No clipping
    for (let i = 0; i < out.length; i++) {
        assert.ok(out[i] >= -1.0 && out[i] <= 1.0, "Clips!");
    }
});

test("Synthesised pitch is correct", () => {
    // 1 second of A4 (69)
    const midi = 69;
    const hzExpected = midiToHz(midi);
    // Use vibratoCents = 0 to get a stable pitch 
    const config = { ...DEFAULT_SYNTH_CONFIG, vibratoCents: 0, bowNoise: 0 };
    const out = synthNote(midi, 1.0, config);
    
    const estHz = estimateHz(out);
    assertCents(estHz, hzExpected, 2.0); // Within 2 cents
});

test("centsErrors / timingJitter / tempoScale shift pitch and timing correctly", () => {
    const lick = {
        notes: [{ midi: 60, beats: 2 }],
        tempoBpm: 60, // 1 beat = 1s, duration = 2s
        mode: "major", tonicMidi: 60, world: 1, seed: 1
    };

    const cfg = { ...DEFAULT_SYNTH_CONFIG, vibratoCents: 0, bowNoise: 0 };
    
    // Base render
    const base = renderLick(lick, cfg, { leadInS: 0, tailS: 0 });
    const baseHz = estimateHz(base);
    assertCents(baseHz, midiToHz(60), 2.0);

    // 1) centsErrors
    const shift = renderLick(lick, cfg, { leadInS: 0, tailS: 0, centsErrors: [50] });
    const shiftHz = estimateHz(shift);
    // Should be +50 cents from base
    assertCents(shiftHz, midiToHz(60.5), 2.0);

    // 2) tempoScale = 0.5
    // Duration is normally 2s, should become 1s
    const fast = renderLick(lick, cfg, { leadInS: 0, tailS: 0, tempoScale: 0.5 });
    // Duration is 1.0, buf is int(1.0*48000)+1 = 48001
    assert.equal(fast.length, 48001);

    // 3) timingJitter
    // Shifts onset by 0.5s
    const jittered = renderLick(lick, cfg, { leadInS: 0, tailS: 0, timingJitterS: [0.5] });
    // Start should be padded with ~0 for 0.5s. Total len = 2.5s (120001)
    assert.equal(jittered.length, 120001);
    
    // First 0.4s should be zeroes or close to it
    let maxJitterPad = 0;
    for(let i = 0; i < 48000 * 0.4; i++) {
        if(Math.abs(jittered[i]) > maxJitterPad) maxJitterPad = Math.abs(jittered[i]);
    }
    assert.equal(maxJitterPad, 0);
});

test("Determinism: same seed, byte-identical output", () => {
    const config = { ...DEFAULT_SYNTH_CONFIG, bowNoise: 0.1 };
    
    const o1 = addNoise(addRoom(synthNote(60, 0.5, config), 0.35, 48000, 123), 20, 123);
    const o2 = addNoise(addRoom(synthNote(60, 0.5, config), 0.35, 48000, 123), 20, 123);

    assert.equal(o1.length, o2.length);
    for (let i = 0; i < o1.length; i++) {
        assert.equal(o1[i], o2[i]);
    }
});

test("WAV header is well-formed", () => {
    const out = synthNote(60, 1.0);
    const wav = wavBytes(out);
    
    const view = new DataView(wav.buffer);
    
    // RIFF
    const riff = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]);
    assert.equal(riff, "RIFF");
    
    // WAVE
    const wave = String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
    assert.equal(wave, "WAVE");

    // fmt
    const fmt = String.fromCharCode(wav[12], wav[13], wav[14], wav[15]);
    assert.equal(fmt, "fmt ");

    // data
    const data = String.fromCharCode(wav[36], wav[37], wav[38], wav[39]);
    assert.equal(data, "data");

    // sample rate
    const sr = view.getUint32(24, true);
    assert.equal(sr, 48000);

    // num channels
    const channels = view.getUint16(22, true);
    assert.equal(channels, 1);
    
    // bits per sample
    const bitDepth = view.getUint16(34, true);
    assert.equal(bitDepth, 16);
});
