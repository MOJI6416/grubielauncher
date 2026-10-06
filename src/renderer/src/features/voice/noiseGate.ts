import { GATE_MIN_DB } from "@/shared/voiceGate";

const SILENCE_DB = -120;
const HOLD_MS = 250;
const ATTACK_MS = 4;
const RELEASE_MS = 60;

export function peakDb(samples: Float32Array): number {
  let peak = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Math.abs(samples[index]);
    if (value > peak) peak = value;
  }
  return peak > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(peak)) : SILENCE_DB;
}

export function levelFraction(db: number): number {
  return Math.min(1, Math.max(0, (db - GATE_MIN_DB) / -GATE_MIN_DB));
}

export interface NoiseGate {
  process(frame: Float32Array): boolean;
  setThreshold(db: number | null): void;
}

export function createNoiseGate(
  sampleRate: number,
  thresholdDb: number | null,
): NoiseGate {
  const attackStep = 1 / Math.max(1, (sampleRate * ATTACK_MS) / 1000);
  const releaseStep = 1 / Math.max(1, (sampleRate * RELEASE_MS) / 1000);
  const holdSamples = (sampleRate * HOLD_MS) / 1000;

  let threshold = thresholdDb;
  let gain = threshold === null ? 1 : 0;
  let heldFor = Number.POSITIVE_INFINITY;

  return {
    setThreshold(db) {
      threshold = db;
      if (db === null) gain = 1;
    },
    process(frame) {
      if (threshold === null) return true;

      const open = peakDb(frame) >= threshold;
      heldFor = open ? 0 : heldFor + frame.length;
      const target = heldFor <= holdSamples ? 1 : 0;

      for (let index = 0; index < frame.length; index++) {
        if (gain < target) gain = Math.min(target, gain + attackStep);
        else if (gain > target) gain = Math.max(target, gain - releaseStep);
        frame[index] *= gain;
      }

      return target === 1;
    },
  };
}
