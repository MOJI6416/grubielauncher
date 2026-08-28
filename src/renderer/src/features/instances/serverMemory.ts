export const SERVER_MEMORY_STEP = 512;
export const SERVER_MEMORY_MIN = 1024;

export function recommendedServerMemory(modCount: number): number {
  if (modCount === 0) return 2048;
  if (modCount <= 30) return 3072;
  if (modCount <= 100) return 4096;

  return 6144;
}

export function clampServerMemory(value: number, maximum: number): number {
  const top = Math.max(SERVER_MEMORY_MIN, maximum);
  const bounded = Math.min(Math.max(value, SERVER_MEMORY_MIN), top);

  return Math.round(bounded / SERVER_MEMORY_STEP) * SERVER_MEMORY_STEP;
}

export function serverMemoryLimit(totalMemoryMb: number): number {
  if (!totalMemoryMb) return 16384;

  return Math.max(4096, totalMemoryMb - 2048);
}
