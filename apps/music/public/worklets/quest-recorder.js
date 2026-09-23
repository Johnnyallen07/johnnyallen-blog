/**
 * Raw audio capture for Fiddle Quest.
 *
 * Deliberately dumber than tuner-processor.js. The tuner needs a pitch reading
 * every hop, so it runs YIN in the audio thread. Grading needs the opposite:
 * the whole attempt, because you cannot align a performance to a target until
 * you have all of it. So this worklet does no analysis at all — it forwards
 * copies of the input frames and lets the main thread concatenate them.
 *
 * This is a separate file rather than a mode flag on tuner-processor.js so that
 * the live tuner, which is already in production, is not touched.
 *
 * Why not MediaRecorder: it produces webm/opus. Lossy compression upstream of a
 * pitch tracker is wrong in principle — Opus reshapes harmonic structure at low
 * bitrates, and YIN works by finding harmonic periodicity.
 */

class QuestRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.recording = false;
        this.port.onmessage = (event) => {
            const type = event.data?.type;
            if (type === "start") {
                this.recording = true;
            } else if (type === "stop") {
                this.recording = false;
            }
        };
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        // Returning true with no input keeps the node alive while the graph is
        // still being wired up; a false here would permanently kill it.
        if (!channel || !this.recording) return true;

        // The render quantum buffer is reused by the engine between calls, so
        // it must be copied before it crosses the port.
        this.port.postMessage({ samples: new Float32Array(channel) });
        return true;
    }
}

registerProcessor("quest-recorder", QuestRecorderProcessor);
