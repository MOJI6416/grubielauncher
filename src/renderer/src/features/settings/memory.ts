export const MEMORY_MIN_MB = 1024;
export const MEMORY_STEP_MB = 512;
const MEMORY_FALLBACK_MAX_MB = 32768;
const SYSTEM_RESERVE_MB = 2048;
const TIGHT_HEADROOM_MB = 3072;
const CRITICAL_HEADROOM_MB = 1536;

export type MemoryPresetId = "vanilla" | "light" | "modpack" | "heavy";

export interface MemoryPreset {
  id: MemoryPresetId;
  mb: number;
}

export interface MemoryAdvice {
  tone: "info" | "warning" | "danger";
  key: "balanced" | "tight" | "critical" | "excessive";
  headroomMb: number;
}

const PRESET_SHARE: Record<MemoryPresetId, number> = {
  vanilla: 0.14,
  light: 0.22,
  modpack: 0.34,
  heavy: 0.45,
};

const PRESET_TARGET_MB: Record<MemoryPresetId, number> = {
  vanilla: 2048,
  light: 4096,
  modpack: 6144,
  heavy: 10240,
};

export const MEMORY_PRESET_IDS: MemoryPresetId[] = [
  "vanilla",
  "light",
  "modpack",
  "heavy",
];

export function toTotalMemoryMb(totalBytes: number): number {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
  return Math.floor(totalBytes / (1024 * 1024));
}

export function roundToStep(mb: number): number {
  return Math.round(mb / MEMORY_STEP_MB) * MEMORY_STEP_MB;
}

export function maxMemoryMb(totalMb: number): number {
  if (!totalMb) return MEMORY_FALLBACK_MAX_MB;
  return Math.max(MEMORY_MIN_MB, roundToStep(totalMb - SYSTEM_RESERVE_MB));
}

export function clampMemory(value: number, totalMb: number): number {
  if (!Number.isFinite(value)) return MEMORY_MIN_MB;
  const max = maxMemoryMb(totalMb);
  return Math.min(max, Math.max(MEMORY_MIN_MB, roundToStep(value)));
}

export function memoryPresets(totalMb: number): MemoryPreset[] {
  const max = maxMemoryMb(totalMb);
  const seen = new Set<number>();
  const presets: MemoryPreset[] = [];

  for (const id of MEMORY_PRESET_IDS) {
    const target = totalMb
      ? Math.min(PRESET_TARGET_MB[id], roundToStep(totalMb * PRESET_SHARE[id]))
      : PRESET_TARGET_MB[id];
    const mb = Math.min(max, Math.max(MEMORY_MIN_MB, roundToStep(target)));

    if (seen.has(mb)) continue;
    seen.add(mb);
    presets.push({ id, mb });
  }

  return presets;
}

export function activePresetId(
  xmx: number,
  totalMb: number,
): MemoryPresetId | null {
  return memoryPresets(totalMb).find((preset) => preset.mb === xmx)?.id ?? null;
}

export function memoryAdvice(
  xmx: number,
  totalMb: number,
  optimizedJvm: boolean,
): MemoryAdvice | null {
  if (!totalMb) return null;

  const headroomMb = Math.max(0, totalMb - xmx);

  if (headroomMb < CRITICAL_HEADROOM_MB) {
    return { tone: "danger", key: "critical", headroomMb };
  }

  if (optimizedJvm && headroomMb < TIGHT_HEADROOM_MB) {
    return { tone: "warning", key: "tight", headroomMb };
  }

  if (xmx >= 12288) {
    return { tone: "warning", key: "excessive", headroomMb };
  }

  return { tone: "info", key: "balanced", headroomMb };
}

export function memoryArgsPreview(xmx: number, optimizedJvm: boolean): string {
  return optimizedJvm ? `-Xms${xmx}M -Xmx${xmx}M` : `-Xms1G -Xmx${xmx}M`;
}

export function memoryTicks(totalMb: number): number[] {
  const max = maxMemoryMb(totalMb);
  const ticks: number[] = [];

  for (let mb = 2048; mb <= max; mb *= 2) ticks.push(mb);

  return ticks;
}

export function tickOffset(mb: number, totalMb: number): number {
  const max = maxMemoryMb(totalMb);
  if (max <= MEMORY_MIN_MB) return 0;
  return ((mb - MEMORY_MIN_MB) / (max - MEMORY_MIN_MB)) * 100;
}
