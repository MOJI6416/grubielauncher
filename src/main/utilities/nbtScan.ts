/**
 * A tiny allocation-free walker over binary NBT.
 *
 * It never builds a tree: callers ask for the children of one compound and get
 * back byte ranges, so a 100 KB chunk can be inspected by reading a handful of
 * scalar fields while the block sections are skipped over.
 */

export const NBT_TAG = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12,
} as const;

export class NbtScanError extends Error {
  constructor(message = "Malformed NBT payload") {
    super(message);
    this.name = "NbtScanError";
  }
}

export interface NbtTagRef {
  name: string;
  type: number;
  /** Offset of the tag type byte. */
  start: number;
  /** Offset of the first payload byte. */
  payloadStart: number;
  /** Offset right after the payload. */
  end: number;
}

function assertNbt(condition: boolean, message?: string): void {
  if (!condition) throw new NbtScanError(message);
}

function readUShort(buffer: Buffer, offset: number): number {
  assertNbt(offset + 2 <= buffer.length);
  return buffer.readUInt16BE(offset);
}

export function readNbtInt(buffer: Buffer, offset: number): number {
  assertNbt(offset + 4 <= buffer.length);
  return buffer.readInt32BE(offset);
}

/** Reads a TAG_Long as a JS number; values beyond 2^53 are clamped. */
export function readNbtLong(buffer: Buffer, offset: number): number {
  assertNbt(offset + 8 <= buffer.length);
  const value = buffer.readBigInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (value < BigInt(Number.MIN_SAFE_INTEGER)) return Number.MIN_SAFE_INTEGER;
  return Number(value);
}

export function writeNbtLong(
  buffer: Buffer,
  offset: number,
  value: number,
): void {
  assertNbt(offset + 8 <= buffer.length);
  buffer.writeBigInt64BE(BigInt(Math.trunc(value)), offset);
}

export function readNbtString(buffer: Buffer, offset: number): string {
  const length = readUShort(buffer, offset);
  assertNbt(offset + 2 + length <= buffer.length);
  return buffer.toString("utf8", offset + 2, offset + 2 + length);
}

export function skipNbtPayload(
  buffer: Buffer,
  type: number,
  offset: number,
): number {
  switch (type) {
    case NBT_TAG.Byte:
      assertNbt(offset + 1 <= buffer.length);
      return offset + 1;
    case NBT_TAG.Short:
      assertNbt(offset + 2 <= buffer.length);
      return offset + 2;
    case NBT_TAG.Int:
    case NBT_TAG.Float:
      assertNbt(offset + 4 <= buffer.length);
      return offset + 4;
    case NBT_TAG.Long:
    case NBT_TAG.Double:
      assertNbt(offset + 8 <= buffer.length);
      return offset + 8;
    case NBT_TAG.ByteArray: {
      const length = readNbtInt(buffer, offset);
      assertNbt(length >= 0 && offset + 4 + length <= buffer.length);
      return offset + 4 + length;
    }
    case NBT_TAG.String: {
      const length = readUShort(buffer, offset);
      assertNbt(offset + 2 + length <= buffer.length);
      return offset + 2 + length;
    }
    case NBT_TAG.List: {
      assertNbt(offset + 5 <= buffer.length);
      const itemType = buffer.readUInt8(offset);
      const length = readNbtInt(buffer, offset + 1);
      assertNbt(length >= 0);

      let cursor = offset + 5;
      if (itemType === NBT_TAG.End) {
        assertNbt(length === 0);
        return cursor;
      }

      for (let index = 0; index < length; index += 1) {
        cursor = skipNbtPayload(buffer, itemType, cursor);
      }
      return cursor;
    }
    case NBT_TAG.Compound: {
      let cursor = offset;
      for (;;) {
        assertNbt(cursor + 1 <= buffer.length);
        const childType = buffer.readUInt8(cursor);
        if (childType === NBT_TAG.End) return cursor + 1;

        const nameLength = readUShort(buffer, cursor + 1);
        cursor = skipNbtPayload(buffer, childType, cursor + 3 + nameLength);
      }
    }
    case NBT_TAG.IntArray: {
      const length = readNbtInt(buffer, offset);
      assertNbt(length >= 0 && offset + 4 + length * 4 <= buffer.length);
      return offset + 4 + length * 4;
    }
    case NBT_TAG.LongArray: {
      const length = readNbtInt(buffer, offset);
      assertNbt(length >= 0 && offset + 4 + length * 8 <= buffer.length);
      return offset + 4 + length * 8;
    }
    default:
      throw new NbtScanError(`Unknown NBT tag type ${type}`);
  }
}

/** Lists the direct children of the compound whose payload starts at `offset`. */
export function readNbtCompound(buffer: Buffer, offset: number): NbtTagRef[] {
  const children: NbtTagRef[] = [];
  let cursor = offset;

  for (;;) {
    assertNbt(cursor + 1 <= buffer.length);
    const type = buffer.readUInt8(cursor);
    if (type === NBT_TAG.End) return children;

    const nameLength = readUShort(buffer, cursor + 1);
    assertNbt(cursor + 3 + nameLength <= buffer.length);
    const name = buffer.toString("utf8", cursor + 3, cursor + 3 + nameLength);
    const payloadStart = cursor + 3 + nameLength;
    const end = skipNbtPayload(buffer, type, payloadStart);

    children.push({ name, type, start: cursor, payloadStart, end });
    cursor = end;
  }
}

/** Reads the root compound header of an uncompressed NBT file. */
export function readNbtRoot(buffer: Buffer): NbtTagRef {
  assertNbt(buffer.length >= 3, "NBT payload is too short");
  const type = buffer.readUInt8(0);
  assertNbt(type === NBT_TAG.Compound, "NBT root is not a compound");

  const nameLength = readUShort(buffer, 1);
  assertNbt(3 + nameLength <= buffer.length);
  const name = buffer.toString("utf8", 3, 3 + nameLength);
  const payloadStart = 3 + nameLength;
  const end = skipNbtPayload(buffer, NBT_TAG.Compound, payloadStart);

  return { name, type, start: 0, payloadStart, end };
}

export function findNbtChild(
  children: NbtTagRef[],
  name: string,
  type?: number,
): NbtTagRef | null {
  for (const child of children) {
    if (child.name !== name) continue;
    if (type !== undefined && child.type !== type) continue;
    return child;
  }
  return null;
}

/** Number of items in a TAG_List whose payload starts at `offset`. */
export function readNbtListLength(buffer: Buffer, offset: number): number {
  assertNbt(offset + 5 <= buffer.length);
  return readNbtInt(buffer, offset + 1);
}
