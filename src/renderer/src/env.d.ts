/// <reference types="vite/client" />

declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack });
  readonly readable: ReadableStream<AudioData>;
}

declare class MediaStreamTrackGenerator extends MediaStreamTrack {
  constructor(init: { kind: "audio" });
  readonly writable: WritableStream<AudioData>;
}
