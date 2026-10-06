import { describe, expect, it } from "vitest";
import {
  audioQualityWindow,
  captureSettingsSummary,
  type InboundAudioCounters,
  isDegradedAudio,
  readInboundAudio,
} from "./callQuality";

function counters(patch: Partial<InboundAudioCounters>): InboundAudioCounters {
  return {
    packetsReceived: 0,
    packetsLost: 0,
    totalSamplesReceived: 0,
    concealedSamples: 0,
    silentConcealedSamples: 0,
    insertedSamplesForDeceleration: 0,
    removedSamplesForAcceleration: 0,
    jitter: 0,
    ...patch,
  };
}

describe("readInboundAudio", () => {
  it("picks the inbound audio entry from a stats report", () => {
    const report = new Map<string, unknown>([
      ["t1", { type: "transport", bytesReceived: 10 }],
      ["v1", { type: "inbound-rtp", kind: "video", packetsReceived: 99 }],
      [
        "a1",
        {
          type: "inbound-rtp",
          kind: "audio",
          packetsReceived: 500,
          packetsLost: 4,
          totalSamplesReceived: 480_000,
          concealedSamples: 960,
          jitter: 0.012,
        },
      ],
    ]);

    expect(readInboundAudio(report)).toEqual(
      counters({
        packetsReceived: 500,
        packetsLost: 4,
        totalSamplesReceived: 480_000,
        concealedSamples: 960,
        jitter: 0.012,
      }),
    );
  });

  it("returns null when the report has no inbound audio", () => {
    expect(readInboundAudio(new Map([["x", { type: "codec" }]]))).toBeNull();
  });
});

describe("audioQualityWindow", () => {
  it("measures the window between two snapshots", () => {
    const previous = counters({
      packetsReceived: 1000,
      packetsLost: 10,
      totalSamplesReceived: 480_000,
      concealedSamples: 1000,
      silentConcealedSamples: 400,
    });
    const next = counters({
      packetsReceived: 1475,
      packetsLost: 35,
      totalSamplesReceived: 960_000,
      concealedSamples: 25_600,
      silentConcealedSamples: 1_000,
      insertedSamplesForDeceleration: 2_400,
      removedSamplesForAcceleration: 2_400,
      jitter: 0.032,
    });

    expect(audioQualityWindow(previous, next)).toEqual({
      lossPct: 5,
      concealedPct: 5,
      stretchedPct: 1,
      jitterMs: 32,
    });
  });

  it("skips windows shorter than a second of audio", () => {
    const previous = counters({ totalSamplesReceived: 100_000 });
    const next = counters({ totalSamplesReceived: 120_000 });
    expect(audioQualityWindow(previous, next)).toBeNull();
  });

  it("treats the first snapshot as a window from zero", () => {
    const next = counters({
      packetsReceived: 100,
      totalSamplesReceived: 96_000,
    });
    expect(audioQualityWindow(null, next)).toEqual({
      lossPct: 0,
      concealedPct: 0,
      stretchedPct: 0,
      jitterMs: 0,
    });
  });
});

describe("isDegradedAudio", () => {
  const clean = { lossPct: 0, concealedPct: 0, stretchedPct: 0, jitterMs: 10 };

  it("flags loss, concealment and heavy time stretching", () => {
    expect(isDegradedAudio(clean)).toBe(false);
    expect(isDegradedAudio({ ...clean, lossPct: 3 })).toBe(true);
    expect(isDegradedAudio({ ...clean, concealedPct: 5 })).toBe(true);
    expect(isDegradedAudio({ ...clean, stretchedPct: 10 })).toBe(true);
    expect(isDegradedAudio({ ...clean, jitterMs: 400 })).toBe(false);
  });
});

describe("captureSettingsSummary", () => {
  it("keeps only the audio processing fields", () => {
    expect(
      captureSettingsSummary({
        deviceId: "secret-device-id",
        groupId: "group",
        sampleRate: 48000,
        channelCount: 1,
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: false,
      }),
    ).toEqual({
      sampleRate: 48000,
      channelCount: 1,
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: false,
    });
    expect(captureSettingsSummary(undefined)).toEqual({});
  });
});
