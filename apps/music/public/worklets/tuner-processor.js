const MIN_FREQUENCY = 65;
const MAX_FREQUENCY = 2200;
const FRAME_SIZE = 4096;
const HOP_SIZE = 2048;
const RMS_GATE = 0.012;
const YIN_THRESHOLD = 0.12;

class TunerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(FRAME_SIZE);
        this.writeIndex = 0;
        this.samplesSincePost = 0;
        // Pending [from, to] context-time windows that overlap a metronome click.
        this.blankWindows = [];
        this.port.onmessage = (event) => {
            const data = event.data;
            if (!data) return;
            if (data.type === "blank" && Number.isFinite(data.from) && Number.isFinite(data.to)) {
                this.blankWindows.push([data.from, data.to]);
            } else if (data.type === "clear") {
                this.blankWindows.length = 0;
            }
        };
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        if (!channel) return true;

        for (let index = 0; index < channel.length; index += 1) {
            this.buffer[this.writeIndex] = channel[index];
            this.writeIndex = (this.writeIndex + 1) % FRAME_SIZE;
            this.samplesSincePost += 1;
        }

        if (this.samplesSincePost >= HOP_SIZE) {
            this.samplesSincePost = 0;
            const frame = this.readFrame();

            const frameEnd = currentTime + channel.length / sampleRate;
            const frameStart = frameEnd - FRAME_SIZE / sampleRate;
            this.blankWindows = this.blankWindows.filter((window) => window[1] >= frameStart);
            const blanked = this.blankWindows.some((window) => window[0] <= frameEnd && window[1] >= frameStart);

            if (blanked) {
                const rms = computeRms(frame);
                this.port.postMessage({ frequency: 0, confidence: 0, rms, blanked: true });
            } else {
                this.port.postMessage(detectPitch(frame, sampleRate));
            }
        }

        return true;
    }

    readFrame() {
        const frame = new Float32Array(FRAME_SIZE);
        for (let index = 0; index < FRAME_SIZE; index += 1) {
            frame[index] = this.buffer[(this.writeIndex + index) % FRAME_SIZE];
        }
        return frame;
    }
}

function computeRms(frame) {
    let sumSquares = 0;
    for (let index = 0; index < frame.length; index += 1) {
        sumSquares += frame[index] * frame[index];
    }
    return Math.sqrt(sumSquares / frame.length);
}

function detectPitch(frame, rate) {
    const rms = computeRms(frame);
    if (rms < RMS_GATE) {
        return { frequency: 0, confidence: 0, rms };
    }

    const minTau = Math.floor(rate / MAX_FREQUENCY);
    const maxTau = Math.min(Math.floor(rate / MIN_FREQUENCY), Math.floor(frame.length / 2));
    const yin = new Float32Array(maxTau + 1);

    for (let tau = 1; tau <= maxTau; tau += 1) {
        let difference = 0;
        for (let index = 0; index < maxTau; index += 1) {
            const delta = frame[index] - frame[index + tau];
            difference += delta * delta;
        }
        yin[tau] = difference;
    }

    yin[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
        runningSum += yin[tau];
        yin[tau] = runningSum === 0 ? 1 : (yin[tau] * tau) / runningSum;
    }

    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
        if (yin[tau] < YIN_THRESHOLD) {
            while (tau + 1 <= maxTau && yin[tau + 1] < yin[tau]) tau += 1;
            tauEstimate = tau;
            break;
        }
    }

    if (tauEstimate === -1) {
        let bestTau = minTau;
        for (let tau = minTau + 1; tau <= maxTau; tau += 1) {
            if (yin[tau] < yin[bestTau]) bestTau = tau;
        }
        if (yin[bestTau] > 0.28) return { frequency: 0, confidence: 0, rms };
        tauEstimate = bestTau;
    }

    const betterTau = parabolicInterpolation(yin, tauEstimate);
    const frequency = rate / betterTau;
    const confidence = Math.max(0, Math.min(1, 1 - yin[tauEstimate]));

    if (!Number.isFinite(frequency) || frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
        return { frequency: 0, confidence: 0, rms };
    }

    return { frequency, confidence, rms };
}

function parabolicInterpolation(values, tau) {
    const left = values[tau - 1];
    const center = values[tau];
    const right = values[tau + 1];
    const divisor = left + right - 2 * center;
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.000001) return tau;
    return tau + (left - right) / (2 * divisor);
}

registerProcessor("tuner-processor", TunerProcessor);
