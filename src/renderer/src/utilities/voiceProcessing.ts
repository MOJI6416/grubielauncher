import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import VoiceWorker from "./voiceWorker?worker";

export interface VoiceProcessingConfig {
  denoise: boolean;
  gateDb: number | null;
}

export type VoiceWorkerRequest =
  | {
      type: "start";
      readable: ReadableStream<AudioData>;
      writable: WritableStream<AudioData>;
      wasm: ArrayBuffer | null;
      config: VoiceProcessingConfig;
    }
  | { type: "config"; config: VoiceProcessingConfig }
  | { type: "stop" };

export type VoiceWorkerMessage =
  | { type: "denoise-failed"; reason: string }
  | { type: "sample-rate"; sampleRate: number }
  | { type: "failed"; reason: string };

export interface VoiceProcessingCallbacks {
  onDenoiseFailed?: (reason: string) => void;
  onFailed?: (reason: string) => void;
}

const api = window.api;

let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;

async function fetchWasmBinary(): Promise<ArrayBuffer> {
  const absoluteUrl = new URL(rnnoiseWasmUrl, window.location.href).href;

  if (absoluteUrl.startsWith("file:")) {
    const bytes = await api.fs.readFileBuffer(absoluteUrl);
    if (!bytes) throw new Error("rnnoise wasm read failed");
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }

  const response = await fetch(absoluteUrl);
  if (!response.ok) throw new Error(`rnnoise wasm fetch ${response.status}`);
  return response.arrayBuffer();
}

function getWasmBinary(): Promise<ArrayBuffer> {
  if (!wasmBinaryPromise) {
    wasmBinaryPromise = fetchWasmBinary();
    wasmBinaryPromise.catch(() => {
      wasmBinaryPromise = null;
    });
  }
  return wasmBinaryPromise;
}

export function isVoiceProcessingSupported(): boolean {
  return (
    typeof MediaStreamTrackProcessor === "function" &&
    typeof MediaStreamTrackGenerator === "function"
  );
}

export function sameProcessingConfig(
  a: VoiceProcessingConfig | null,
  b: VoiceProcessingConfig | null,
): boolean {
  if (!a || !b) return a === b;
  return a.denoise === b.denoise && a.gateDb === b.gateDb;
}

export class VoiceTrackProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "grubie-voice";
  processedTrack?: MediaStreamTrack;

  private worker: Worker | null = null;

  constructor(
    private config: VoiceProcessingConfig,
    private readonly callbacks: VoiceProcessingCallbacks = {},
  ) {}

  get currentConfig(): VoiceProcessingConfig {
    return this.config;
  }

  async init(opts: AudioProcessorOptions) {
    await this.start(opts.track);
  }

  async start(track: MediaStreamTrack) {
    if (!isVoiceProcessingSupported()) {
      throw new Error("MediaStreamTrackProcessor is unavailable");
    }

    const wasm = await getWasmBinary().catch(() => null);
    const worker = new VoiceWorker();
    worker.addEventListener(
      "message",
      (event: MessageEvent<VoiceWorkerMessage>) => {
        const message = event.data;
        if (message.type === "denoise-failed") {
          this.callbacks.onDenoiseFailed?.(message.reason);
        } else if (message.type === "failed") {
          this.callbacks.onFailed?.(message.reason);
        } else {
          console.warn(
            `[Voice] Noise suppression needs 48 kHz, got ${message.sampleRate} Hz`,
          );
        }
      },
    );
    worker.addEventListener("error", (event) => {
      this.callbacks.onFailed?.(event.message || "voice worker crashed");
    });

    const processor = new MediaStreamTrackProcessor({ track });
    const generator = new MediaStreamTrackGenerator({ kind: "audio" });
    const request: VoiceWorkerRequest = {
      type: "start",
      readable: processor.readable,
      writable: generator.writable,
      wasm: wasm ? wasm.slice(0) : null,
      config: this.config,
    };
    worker.postMessage(request, [processor.readable, generator.writable]);

    this.worker = worker;
    this.processedTrack = generator;
  }

  configure(config: VoiceProcessingConfig) {
    this.config = config;
    const request: VoiceWorkerRequest = { type: "config", config };
    this.worker?.postMessage(request);
  }

  async restart(opts: AudioProcessorOptions) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      const request: VoiceWorkerRequest = { type: "stop" };
      worker.postMessage(request);
      worker.terminate();
    }
    this.processedTrack?.stop();
    this.processedTrack = undefined;
  }
}
