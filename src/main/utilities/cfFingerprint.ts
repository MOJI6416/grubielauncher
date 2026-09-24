import fs from "fs-extra";

const MURMUR_M = 0x5bd1e995;
const MURMUR_R = 24;

function isWhitespace(byte: number): boolean {
  return byte === 9 || byte === 10 || byte === 13 || byte === 32;
}

export function curseForgeFingerprint(data: Uint8Array): number {
  const normalized = new Uint8Array(data.length);
  let length = 0;
  for (const byte of data) {
    if (!isWhitespace(byte)) normalized[length++] = byte;
  }

  let hash = (1 ^ length) >>> 0;
  let index = 0;
  let remaining = length;

  while (remaining >= 4) {
    let k =
      (normalized[index] |
        (normalized[index + 1] << 8) |
        (normalized[index + 2] << 16) |
        (normalized[index + 3] << 24)) >>>
      0;
    k = Math.imul(k, MURMUR_M) >>> 0;
    k ^= k >>> MURMUR_R;
    k = Math.imul(k, MURMUR_M) >>> 0;
    hash = Math.imul(hash, MURMUR_M) >>> 0;
    hash = (hash ^ k) >>> 0;
    index += 4;
    remaining -= 4;
  }

  if (remaining === 3) hash ^= normalized[index + 2] << 16;
  if (remaining >= 2) hash ^= normalized[index + 1] << 8;
  if (remaining >= 1) {
    hash ^= normalized[index];
    hash = Math.imul(hash, MURMUR_M) >>> 0;
  }

  hash ^= hash >>> 13;
  hash = Math.imul(hash, MURMUR_M) >>> 0;
  hash ^= hash >>> 15;

  return hash >>> 0;
}

export async function fileCurseForgeFingerprint(
  filePath: string,
): Promise<number> {
  return curseForgeFingerprint(await fs.readFile(filePath));
}
