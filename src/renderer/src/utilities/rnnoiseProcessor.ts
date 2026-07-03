import type {
  AudioProcessorOptions,
  Track,
  TrackProcessor,
} from "livekit-client";
import { RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWorkletSource from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?raw";

const api = window.api;
const RNNOISE_SAMPLE_RATE = 48000;

let wasmBinaryPromise: Promise<ArrayBuffer> | null = null;
let workletBlobUrl: string | null = null;

function getWorkletUrl(): string {
  if (!workletBlobUrl) {
    workletBlobUrl = URL.createObjectURL(
      new Blob([rnnoiseWorkletSource], { type: "application/javascript" }),
    );
  }
  return workletBlobUrl;
}

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

export class RnnoiseTrackProcessor
  implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>
{
  name = "rnnoise";
  processedTrack?: MediaStreamTrack;

  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rnnoise: RnnoiseWorkletNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;

  constructor(private readonly onProcessorError?: (reason: string) => void) {}

  get contextSampleRate(): number | null {
    return this.context?.sampleRate ?? null;
  }

  async init(opts: AudioProcessorOptions) {
    const { track } = opts;
    const wasmBinary = await getWasmBinary();

    const context = new AudioContext({ sampleRate: RNNOISE_SAMPLE_RATE });
    this.context = context;
    await context.audioWorklet.addModule(getWorkletUrl());
    await context.resume().catch(() => undefined);

    this.source = context.createMediaStreamSource(new MediaStream([track]));
    this.rnnoise = new RnnoiseWorkletNode(context, {
      wasmBinary,
      maxChannels: 2,
    });
    this.rnnoise.onprocessorerror = (event) => {
      const reason =
        (event as ErrorEvent)?.message || "audio worklet processor crashed";
      this.onProcessorError?.(reason);
    };
    this.destination = context.createMediaStreamDestination();

    this.source.connect(this.rnnoise);
    this.rnnoise.connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    this.source?.disconnect();
    this.rnnoise?.disconnect();
    this.rnnoise?.destroy();
    this.processedTrack?.stop();
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.source = null;
    this.rnnoise = null;
    this.destination = null;
    this.processedTrack = undefined;
  }
}
