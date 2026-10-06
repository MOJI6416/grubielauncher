import {
  createNoiseGate,
  type NoiseGate,
} from "@renderer/features/voice/noiseGate";
import type {
  VoiceProcessingConfig,
  VoiceWorkerMessage,
  VoiceWorkerRequest,
} from "./voiceProcessing";

const RNNOISE_SAMPLE_RATE = 48000;
const RNNOISE_SCALE = 32767;
const WASM_PAGE = 65536;

interface RnnoiseExports {
  memory: WebAssembly.Memory;
  __wasm_call_ctors(): void;
  emscripten_stack_init(): void;
  rnnoise_get_frame_size(): number;
  rnnoise_create(model: number): number;
  rnnoise_destroy(state: number): void;
  rnnoise_process_frame(state: number, output: number, input: number): number;
  malloc(size: number): number;
  free(pointer: number): void;
}

interface Denoiser {
  frameSize: number;
  process(frame: Float32Array): void;
  destroy(): void;
}

function post(message: VoiceWorkerMessage) {
  self.postMessage(message);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createDenoiser(binary: ArrayBuffer): Promise<Denoiser> {
  let memory: WebAssembly.Memory | null = null;

  const env = {
    emscripten_memcpy_big(destination: number, source: number, count: number) {
      new Uint8Array(memory!.buffer).copyWithin(
        destination,
        source,
        source + count,
      );
    },
    emscripten_resize_heap(requested: number) {
      const current = memory!.buffer.byteLength;
      if (requested <= current) return 1;
      try {
        memory!.grow(Math.ceil((requested - current) / WASM_PAGE));
        return 1;
      } catch {
        return 0;
      }
    },
    __assert_fail() {
      throw new Error("rnnoise assertion failed");
    },
  };

  const { instance } = await WebAssembly.instantiate(binary, { env });
  const wasm = instance.exports as unknown as RnnoiseExports;
  memory = wasm.memory;
  wasm.emscripten_stack_init();
  wasm.__wasm_call_ctors();

  const frameSize = wasm.rnnoise_get_frame_size();
  const state = wasm.rnnoise_create(0);
  const input = wasm.malloc(frameSize * 4);
  const output = wasm.malloc(frameSize * 4);
  if (!state || !input || !output) throw new Error("rnnoise allocation failed");

  return {
    frameSize,
    process(frame) {
      const heap = new Float32Array(wasm.memory.buffer);
      const inputIndex = input >> 2;
      for (let index = 0; index < frameSize; index++) {
        heap[inputIndex + index] = frame[index] * RNNOISE_SCALE;
      }

      wasm.rnnoise_process_frame(state, output, input);

      const result = new Float32Array(wasm.memory.buffer, output, frameSize);
      for (let index = 0; index < frameSize; index++) {
        frame[index] = Math.max(
          -1,
          Math.min(1, result[index] / RNNOISE_SCALE),
        );
      }
    },
    destroy() {
      wasm.rnnoise_destroy(state);
      wasm.free(input);
      wasm.free(output);
    },
  };
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  if (a.length === 0) return b;
  const joined = new Float32Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}

function createFrameQueue(denoiser: Denoiser) {
  let pending: Float32Array = new Float32Array(0);
  let ready: Float32Array = new Float32Array(0);

  return {
    reset() {
      pending = new Float32Array(0);
      ready = new Float32Array(0);
    },
    process(samples: Float32Array): Float32Array {
      pending = concat(pending, samples);
      while (pending.length >= denoiser.frameSize) {
        const frame = pending.slice(0, denoiser.frameSize);
        denoiser.process(frame);
        ready = concat(ready, frame);
        pending = pending.slice(denoiser.frameSize);
      }

      const available = Math.min(samples.length, ready.length);
      const output = new Float32Array(samples.length);
      output.set(ready.subarray(0, available), samples.length - available);
      ready = ready.slice(available);
      return output;
    },
  };
}

function toMono(chunk: AudioData): Float32Array {
  const frames = chunk.numberOfFrames;
  const channels = chunk.numberOfChannels;
  const mono = new Float32Array(frames);
  const plane = new Float32Array(frames);

  for (let channel = 0; channel < channels; channel++) {
    chunk.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
    for (let index = 0; index < frames; index++) {
      mono[index] += plane[index] / channels;
    }
  }

  return mono;
}

let config: VoiceProcessingConfig = { denoise: false, gateDb: null };
let denoiser: Denoiser | null = null;
let queue: ReturnType<typeof createFrameQueue> | null = null;
let gate: NoiseGate | null = null;
let gateRate = 0;
let reader: ReadableStreamDefaultReader<AudioData> | null = null;
let rateWarned = false;

function disableDenoiser(reason: string) {
  denoiser?.destroy();
  denoiser = null;
  queue = null;
  post({ type: "denoise-failed", reason });
}

function processChunk(chunk: AudioData): Float32Array {
  let samples = toMono(chunk);

  if (config.denoise && queue) {
    if (chunk.sampleRate === RNNOISE_SAMPLE_RATE) {
      try {
        samples = queue.process(samples);
      } catch (error) {
        disableDenoiser(describe(error));
      }
    } else if (!rateWarned) {
      rateWarned = true;
      post({ type: "sample-rate", sampleRate: chunk.sampleRate });
    }
  }

  if (!gate || gateRate !== chunk.sampleRate) {
    gate = createNoiseGate(chunk.sampleRate, config.gateDb);
    gateRate = chunk.sampleRate;
  }
  gate.process(samples);

  return samples;
}

async function start(
  request: Extract<VoiceWorkerRequest, { type: "start" }>,
) {
  config = request.config;

  if (request.wasm) {
    try {
      denoiser = await createDenoiser(request.wasm);
      queue = createFrameQueue(denoiser);
    } catch (error) {
      if (config.denoise) disableDenoiser(describe(error));
    }
  } else if (config.denoise) {
    post({ type: "denoise-failed", reason: "rnnoise binary is missing" });
  }

  reader = request.readable.getReader();
  const writer = request.writable.getWriter();

  try {
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done || !chunk) break;

      const samples = processChunk(chunk);
      const output = new AudioData({
        format: "f32-planar",
        sampleRate: chunk.sampleRate,
        numberOfFrames: samples.length,
        numberOfChannels: 1,
        timestamp: chunk.timestamp,
        data: samples,
      });
      chunk.close();
      await writer.write(output);
    }
  } catch (error) {
    post({ type: "failed", reason: describe(error) });
  } finally {
    await writer.close().catch(() => undefined);
    denoiser?.destroy();
    denoiser = null;
  }
}

self.addEventListener("message", (event: MessageEvent<VoiceWorkerRequest>) => {
  const request = event.data;

  if (request.type === "start") {
    void start(request);
    return;
  }

  if (request.type === "config") {
    const wasDenoising = config.denoise;
    config = request.config;
    gate?.setThreshold(config.gateDb);
    if (wasDenoising !== config.denoise) queue?.reset();
    if (config.denoise && !denoiser) {
      post({ type: "denoise-failed", reason: "rnnoise is unavailable" });
    }
    return;
  }

  void reader?.cancel().catch(() => undefined);
});
