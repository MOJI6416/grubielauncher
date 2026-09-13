import { statfs } from "fs/promises";

export const FREE_SPACE_MARGIN_BYTES = 256 * 1024 * 1024;

export async function getFreeBytes(target: string): Promise<number | null> {
  try {
    const stats = await statfs(target);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

export function hasRoomFor(
  freeBytes: number | null,
  neededBytes: number,
): boolean {
  return freeBytes === null || freeBytes >= neededBytes + FREE_SPACE_MARGIN_BYTES;
}
