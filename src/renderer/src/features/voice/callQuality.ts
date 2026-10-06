export interface InboundAudioCounters {
  packetsReceived: number;
  packetsLost: number;
  totalSamplesReceived: number;
  concealedSamples: number;
  silentConcealedSamples: number;
  insertedSamplesForDeceleration: number;
  removedSamplesForAcceleration: number;
  jitter: number;
}

export interface AudioQualityWindow {
  lossPct: number;
  concealedPct: number;
  stretchedPct: number;
  jitterMs: number;
}

const MIN_WINDOW_SAMPLES = 48_000;
const DEGRADED_LOSS_PCT = 3;
const DEGRADED_CONCEALED_PCT = 5;
const DEGRADED_STRETCHED_PCT = 10;

function counter(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function readInboundAudio(report: {
  forEach(callback: (value: unknown) => void): void;
}): InboundAudioCounters | null {
  const matches: Record<string, unknown>[] = [];
  report.forEach((value) => {
    const entry = value as Record<string, unknown> | null;
    if (entry?.type === "inbound-rtp" && entry.kind === "audio") {
      matches.push(entry);
    }
  });
  const stats = matches[0];
  if (!stats) return null;

  return {
    packetsReceived: counter(stats, "packetsReceived"),
    packetsLost: counter(stats, "packetsLost"),
    totalSamplesReceived: counter(stats, "totalSamplesReceived"),
    concealedSamples: counter(stats, "concealedSamples"),
    silentConcealedSamples: counter(stats, "silentConcealedSamples"),
    insertedSamplesForDeceleration: counter(
      stats,
      "insertedSamplesForDeceleration",
    ),
    removedSamplesForAcceleration: counter(
      stats,
      "removedSamplesForAcceleration",
    ),
    jitter: counter(stats, "jitter"),
  };
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((Math.max(0, part) / whole) * 1000) / 10;
}

export function audioQualityWindow(
  previous: InboundAudioCounters | null,
  next: InboundAudioCounters,
): AudioQualityWindow | null {
  const base = previous ?? {
    packetsReceived: 0,
    packetsLost: 0,
    totalSamplesReceived: 0,
    concealedSamples: 0,
    silentConcealedSamples: 0,
    insertedSamplesForDeceleration: 0,
    removedSamplesForAcceleration: 0,
    jitter: 0,
  };

  const samples = next.totalSamplesReceived - base.totalSamplesReceived;
  if (samples < MIN_WINDOW_SAMPLES) return null;

  const received = next.packetsReceived - base.packetsReceived;
  const lost = next.packetsLost - base.packetsLost;
  const audibleConcealed =
    next.concealedSamples -
    base.concealedSamples -
    (next.silentConcealedSamples - base.silentConcealedSamples);
  const stretched =
    next.insertedSamplesForDeceleration -
    base.insertedSamplesForDeceleration +
    (next.removedSamplesForAcceleration - base.removedSamplesForAcceleration);

  return {
    lossPct: percent(lost, received + Math.max(0, lost)),
    concealedPct: percent(audibleConcealed, samples),
    stretchedPct: percent(stretched, samples),
    jitterMs: Math.round(next.jitter * 1000),
  };
}

export function isDegradedAudio(window: AudioQualityWindow): boolean {
  return (
    window.lossPct >= DEGRADED_LOSS_PCT ||
    window.concealedPct >= DEGRADED_CONCEALED_PCT ||
    window.stretchedPct >= DEGRADED_STRETCHED_PCT
  );
}

const CAPTURE_SETTING_KEYS = [
  "sampleRate",
  "channelCount",
  "latency",
  "autoGainControl",
  "echoCancellation",
  "noiseSuppression",
  "voiceIsolation",
] as const;

export function captureSettingsSummary(
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (!settings) return summary;
  for (const key of CAPTURE_SETTING_KEYS) {
    if (settings[key] !== undefined) summary[key] = settings[key];
  }
  return summary;
}
