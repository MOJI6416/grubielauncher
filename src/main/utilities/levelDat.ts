const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

class NbtScanError extends Error {}

function assertNbt(condition: boolean): void {
  if (!condition) throw new NbtScanError("Malformed NBT payload");
}

function readUShort(buffer: Buffer, offset: number): number {
  assertNbt(offset + 2 <= buffer.length);
  return buffer.readUInt16BE(offset);
}

function readInt(buffer: Buffer, offset: number): number {
  assertNbt(offset + 4 <= buffer.length);
  return buffer.readInt32BE(offset);
}

function skipPayload(buffer: Buffer, type: number, offset: number): number {
  switch (type) {
    case TAG_BYTE:
      assertNbt(offset + 1 <= buffer.length);
      return offset + 1;
    case TAG_SHORT:
      assertNbt(offset + 2 <= buffer.length);
      return offset + 2;
    case TAG_INT:
    case TAG_FLOAT:
      assertNbt(offset + 4 <= buffer.length);
      return offset + 4;
    case TAG_LONG:
    case TAG_DOUBLE:
      assertNbt(offset + 8 <= buffer.length);
      return offset + 8;
    case TAG_BYTE_ARRAY: {
      const length = readInt(buffer, offset);
      assertNbt(length >= 0 && offset + 4 + length <= buffer.length);
      return offset + 4 + length;
    }
    case TAG_STRING: {
      const length = readUShort(buffer, offset);
      assertNbt(offset + 2 + length <= buffer.length);
      return offset + 2 + length;
    }
    case TAG_LIST: {
      assertNbt(offset + 5 <= buffer.length);
      const itemType = buffer.readUInt8(offset);
      const length = readInt(buffer, offset + 1);
      assertNbt(length >= 0);

      let cursor = offset + 5;
      if (itemType === TAG_END) {
        assertNbt(length === 0);
        return cursor;
      }

      for (let index = 0; index < length; index += 1) {
        cursor = skipPayload(buffer, itemType, cursor);
      }
      return cursor;
    }
    case TAG_COMPOUND: {
      let cursor = offset;
      for (;;) {
        assertNbt(cursor + 1 <= buffer.length);
        const childType = buffer.readUInt8(cursor);
        if (childType === TAG_END) return cursor + 1;

        const nameLength = readUShort(buffer, cursor + 1);
        cursor = skipPayload(buffer, childType, cursor + 3 + nameLength);
      }
    }
    case TAG_INT_ARRAY: {
      const length = readInt(buffer, offset);
      assertNbt(length >= 0 && offset + 4 + length * 4 <= buffer.length);
      return offset + 4 + length * 4;
    }
    case TAG_LONG_ARRAY: {
      const length = readInt(buffer, offset);
      assertNbt(length >= 0 && offset + 4 + length * 8 <= buffer.length);
      return offset + 4 + length * 8;
    }
    default:
      throw new NbtScanError(`Unknown NBT tag type ${type}`);
  }
}

function findChild(
  buffer: Buffer,
  compoundStart: number,
  name: string,
): { start: number; end: number; payloadStart: number; type: number } | null {
  let cursor = compoundStart;

  for (;;) {
    assertNbt(cursor + 1 <= buffer.length);
    const type = buffer.readUInt8(cursor);
    if (type === TAG_END) return null;

    const nameLength = readUShort(buffer, cursor + 1);
    assertNbt(cursor + 3 + nameLength <= buffer.length);
    const tagName = buffer.toString("utf8", cursor + 3, cursor + 3 + nameLength);
    const payloadStart = cursor + 3 + nameLength;
    const end = skipPayload(buffer, type, payloadStart);

    if (tagName === name) return { start: cursor, end, payloadStart, type };
    cursor = end;
  }
}

export function removeLevelDatPlayer(decompressed: Buffer): Buffer | null {
  try {
    assertNbt(decompressed.length >= 3);
    const rootType = decompressed.readUInt8(0);
    if (rootType !== TAG_COMPOUND) return null;

    const rootNameLength = readUShort(decompressed, 1);
    const rootPayload = 3 + rootNameLength;
    assertNbt(rootPayload <= decompressed.length);

    const data = findChild(decompressed, rootPayload, "Data");
    if (!data || data.type !== TAG_COMPOUND) return null;

    const player = findChild(decompressed, data.payloadStart, "Player");
    if (!player) return null;

    return Buffer.concat([
      decompressed.subarray(0, player.start),
      decompressed.subarray(player.end),
    ]);
  } catch {
    return null;
  }
}
