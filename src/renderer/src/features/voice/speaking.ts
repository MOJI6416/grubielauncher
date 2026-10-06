const SILENCE_DB = -120;
const SPEAKING_DB = -45;
const HOLD_MS = 300;

export function rmsDb(samples: Float32Array): number {
  if (samples.length === 0) return SILENCE_DB;
  let sum = 0;
  for (let index = 0; index < samples.length; index++) {
    sum += samples[index] * samples[index];
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB;
}

export interface SpeakingDetector {
  update(key: string, db: number, now: number): boolean;
  forget(key: string): void;
  clear(): void;
}

export function createSpeakingDetector(
  thresholdDb = SPEAKING_DB,
  holdMs = HOLD_MS,
): SpeakingDetector {
  const loudAt = new Map<string, number>();

  return {
    update(key, db, now) {
      if (db >= thresholdDb) loudAt.set(key, now);
      const last = loudAt.get(key);
      return last !== undefined && now - last <= holdMs;
    },
    forget(key) {
      loudAt.delete(key);
    },
    clear() {
      loudAt.clear();
    },
  };
}
