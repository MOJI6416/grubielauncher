export interface MemoryShortfall {
  allocatedMb: number;
  availableMb: number;
}

const BYTES_PER_MB = 1024 * 1024;

export function parseMemAvailable(meminfo: string): number | null {
  const match = /^MemAvailable:\s+(\d+)\s*kB/im.exec(meminfo);
  if (!match) return null;
  const kilobytes = Number(match[1]);
  return Number.isFinite(kilobytes) ? kilobytes * 1024 : null;
}

export function memoryShortfall(input: {
  allocatedMb: number;
  availableBytes: number | null;
}): MemoryShortfall | null {
  if (input.availableBytes === null || !Number.isFinite(input.availableBytes)) {
    return null;
  }
  if (input.availableBytes <= 0) return null;

  const availableMb = Math.floor(input.availableBytes / BYTES_PER_MB);
  if (availableMb >= input.allocatedMb) return null;

  return { allocatedMb: input.allocatedMb, availableMb };
}
