import zlib from "zlib";
import { promisify } from "util";

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);

export interface NbtLongArray {
  kind: "longs";
  length: number;
  words: Uint32Array;
}

export type NbtValue =
  | number
  | string
  | Uint8Array
  | Int32Array
  | NbtLongArray
  | NbtValue[]
  | NbtCompound;

export interface NbtCompound {
  [key: string]: NbtValue;
}

export class NbtTreeError extends Error {
  constructor(message = "Malformed NBT") {
    super(message);
    this.name = "NbtTreeError";
  }
}

const MAX_DEPTH = 512;

export async function inflateNbt(
  data: Buffer,
  maxOutputLength: number,
): Promise<Buffer> {
  const options = { maxOutputLength };
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return Buffer.from(await gunzipAsync(data, options));
  }
  if (data.length >= 2 && data[0] === 0x78) {
    try {
      return Buffer.from(await inflateAsync(data, options));
    } catch (error) {
      if (error instanceof RangeError) throw error;
    }
  }
  return data;
}

class Reader {
  offset = 0;

  constructor(private readonly buffer: Buffer) {}

  private need(bytes: number): void {
    if (bytes < 0 || this.offset + bytes > this.buffer.length) {
      throw new NbtTreeError("NBT ends early");
    }
  }

  byte(): number {
    this.need(1);
    return this.buffer.readInt8(this.offset++);
  }

  ubyte(): number {
    this.need(1);
    return this.buffer[this.offset++];
  }

  short(): number {
    this.need(2);
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  int(): number {
    this.need(4);
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  long(): number {
    this.need(8);
    const value = this.buffer.readBigInt64BE(this.offset);
    this.offset += 8;
    return Number(value);
  }

  float(): number {
    this.need(4);
    const value = this.buffer.readFloatBE(this.offset);
    this.offset += 4;
    return value;
  }

  double(): number {
    this.need(8);
    const value = this.buffer.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }

  string(): string {
    this.need(2);
    const length = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    this.need(length);
    const value = this.buffer.toString(
      "utf8",
      this.offset,
      this.offset + length,
    );
    this.offset += length;
    return value;
  }

  count(itemBytes: number): number {
    const count = this.int();
    if (count < 0) return 0;
    this.need(count * itemBytes);
    return count;
  }

  bytes(): Uint8Array {
    const count = this.count(1);
    const value = this.buffer.subarray(this.offset, this.offset + count);
    this.offset += count;
    return value;
  }

  ints(): Int32Array {
    const count = this.count(4);
    const value = new Int32Array(count);
    for (let index = 0; index < count; index += 1) {
      value[index] = this.buffer.readInt32BE(this.offset);
      this.offset += 4;
    }
    return value;
  }

  longs(): NbtLongArray {
    const count = this.count(8);
    const words = new Uint32Array(count * 2);
    for (let index = 0; index < count; index += 1) {
      words[index * 2 + 1] = this.buffer.readUInt32BE(this.offset);
      words[index * 2] = this.buffer.readUInt32BE(this.offset + 4);
      this.offset += 8;
    }
    return { kind: "longs", length: count, words };
  }
}

function readPayload(reader: Reader, type: number, depth: number): NbtValue {
  if (depth > MAX_DEPTH) throw new NbtTreeError("NBT nests too deep");

  switch (type) {
    case 1:
      return reader.byte();
    case 2:
      return reader.short();
    case 3:
      return reader.int();
    case 4:
      return reader.long();
    case 5:
      return reader.float();
    case 6:
      return reader.double();
    case 7:
      return reader.bytes();
    case 8:
      return reader.string();
    case 9: {
      const itemType = reader.ubyte();
      const count = reader.int();
      if (count <= 0 || itemType === 0) return [];
      const items: NbtValue[] = [];
      for (let index = 0; index < count; index += 1) {
        items.push(readPayload(reader, itemType, depth + 1));
      }
      return items;
    }
    case 10: {
      const compound: NbtCompound = {};
      for (;;) {
        const childType = reader.ubyte();
        if (childType === 0) return compound;
        const name = reader.string();
        compound[name] = readPayload(reader, childType, depth + 1);
      }
    }
    case 11:
      return reader.ints();
    case 12:
      return reader.longs();
    default:
      throw new NbtTreeError(`Unknown NBT tag ${type}`);
  }
}

export function readNbtTree(buffer: Buffer): {
  name: string;
  value: NbtCompound;
} {
  const reader = new Reader(buffer);
  const type = reader.ubyte();
  if (type !== 10) throw new NbtTreeError("NBT root is not a compound");
  const name = reader.string();
  return { name, value: readPayload(reader, 10, 0) as NbtCompound };
}

export function isNbtCompound(value: unknown): value is NbtCompound {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value) &&
    (value as { kind?: unknown }).kind !== "longs"
  );
}

export function isNbtLongArray(value: unknown): value is NbtLongArray {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "longs"
  );
}

export function nbtNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function nbtString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
