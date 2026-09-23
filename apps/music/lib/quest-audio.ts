/**
 * Browser audio transport for Fiddle Quest.
 *
 * This file is deliberately OUTSIDE `lib/quest/`. Everything under `lib/quest/`
 * is pure — no DOM, no Web Audio, no `node:fs` — so that it runs under
 * `node --test` and so that the same code can later run in a worker. This file
 * is the only place that knows a browser exists.
 *
 * Two jobs:
 *   1. Play a Float32Array the engine synthesised.
 *   2. Capture a Float32Array from the microphone.
 *
 * Both are done at the AudioContext's own sample rate, whatever that happens to
 * be. Nothing resamples: the synthesiser is told the rate, and the pitch
 * tracker is told the rate. Resampling would be a silent source of cents error.
 */

/** Frames the recorder pushes across the worklet port. */
interface RecorderMessage {
    samples: Float32Array;
}

export interface QuestRecorder {
    readonly sampleRate: number;
    /** Discards anything captured previously and begins a new take. */
    start(): void;
    /** Ends the take and returns everything captured since `start()`. */
    stop(): Float32Array;
    /** Releases the microphone. The recorder is unusable afterwards. */
    close(): Promise<void>;
}

/**
 * A single AudioContext shared by playback and capture.
 *
 * Browsers cap the number of contexts, and creating one per round leaks them.
 */
export function createQuestAudioContext(): AudioContext {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("AudioContext unavailable");
    return new Ctor();
}

/**
 * Plays raw samples and resolves when the last one has sounded.
 *
 * `AudioBufferSourceNode.onended` is used rather than a timer because the two
 * disagree by tens of milliseconds under load, and the UI unlocks the record
 * button on this promise.
 */
export function playSamples(context: AudioContext, samples: Float32Array, gain = 1): { done: Promise<void>; stop: () => void } {
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    source.buffer = buffer;

    const level = context.createGain();
    level.gain.value = gain;

    source.connect(level).connect(context.destination);

    let settle: () => void = () => {};
    const done = new Promise<void>((resolve) => {
        settle = resolve;
    });
    source.onended = () => settle();
    source.start();

    return {
        done,
        stop: () => {
            try {
                source.stop();
            } catch {
                // Already stopped; `stop()` on a finished source throws.
                settle();
            }
        },
    };
}

/**
 * Opens the microphone and returns a recorder.
 *
 * The constraints matter more than they look. `echoCancellation`,
 * `noiseSuppression` and `autoGainControl` are all pitch-destructive: they are
 * tuned for speech and will happily gate a quiet sustained note or smear a
 * harmonic. The production tuner disables all three for the same reason.
 *
 * The highpass at 55 Hz is below the open G (196 Hz) and removes rumble that
 * would otherwise contribute to the YIN difference function.
 *
 * The zero-gain connection to `destination` exists because Chrome will stop
 * pulling an audio graph that terminates nowhere.
 */
export async function openQuestRecorder(context: AudioContext): Promise<QuestRecorder> {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia unavailable");
    }
    if (typeof AudioWorkletNode === "undefined" || typeof context.audioWorklet?.addModule !== "function") {
        throw new Error("AudioWorklet unavailable");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
    });

    await context.audioWorklet.addModule("/worklets/quest-recorder.js");

    const source = context.createMediaStreamSource(stream);
    const highPass = context.createBiquadFilter();
    highPass.type = "highpass";
    highPass.frequency.value = 55;
    highPass.Q.value = 0.7;

    const processor = new AudioWorkletNode(context, "quest-recorder");
    const silent = context.createGain();
    silent.gain.value = 0;

    source.connect(highPass);
    highPass.connect(processor);
    processor.connect(silent).connect(context.destination);

    let chunks: Float32Array[] = [];
    let total = 0;

    processor.port.onmessage = (event: MessageEvent<RecorderMessage>) => {
        const frame = event.data.samples;
        chunks.push(frame);
        total += frame.length;
    };

    await context.resume();

    return {
        sampleRate: context.sampleRate,
        start() {
            chunks = [];
            total = 0;
            processor.port.postMessage({ type: "start" });
        },
        stop() {
            processor.port.postMessage({ type: "stop" });
            const out = new Float32Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                out.set(chunk, offset);
                offset += chunk.length;
            }
            return out;
        },
        async close() {
            processor.port.postMessage({ type: "stop" });
            processor.port.onmessage = null;
            processor.disconnect();
            silent.disconnect();
            highPass.disconnect();
            source.disconnect();
            for (const track of stream.getTracks()) track.stop();
        },
    };
}
