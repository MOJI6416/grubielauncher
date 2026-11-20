import zlib from "zlib";

export type TestTag =
  | { type: 1 | 2 | 3 | 5 | 6; value: number }
  | { type: 4; value: bigint }
  | { type: 7; value: number[] | Uint8Array }
  | { type: 8; value: string }
  | { type: 9; itemType: number; value: TestTag[] }
  | { type: 10; value: Record<string, TestTag> }
  | { type: 11; value: number[] }
  | { type: 12; value: bigint[] };

export const nbt = {
  byte: (value: number): TestTag => ({ type: 1, value }),
  short: (value: number): TestTag => ({ type: 2, value }),
  int: (value: number): TestTag => ({ type: 3, value }),
  long: (value: bigint | number): TestTag => ({ type: 4, value: BigInt(value) }),
  double: (value: number): TestTag => ({ type: 6, value }),
  string: (value: string): TestTag => ({ type: 8, value }),
  bytes: (value: number[] | Uint8Array): TestTag => ({ type: 7, value }),
  ints: (value: number[]): TestTag => ({ type: 11, value }),
  longs: (value: bigint[]): TestTag => ({ type: 12, value }),
  list: (itemType: number, value: TestTag[]): TestTag => ({
    type: 9,
    itemType,
    value,
  }),
  compound: (value: Record<string, TestTag>): TestTag => ({ type: 10, value }),
};

function name(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function int(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function payload(tag: TestTag): Buffer {
  switch (tag.type) {
    case 1:
      return Buffer.from([tag.value & 0xff]);
    case 2: {
      const buffer = Buffer.alloc(2);
      buffer.writeInt16BE(tag.value);
      return buffer;
    }
    case 3:
      return int(tag.value);
    case 4: {
      const buffer = Buffer.alloc(8);
      buffer.writeBigInt64BE(BigInt.asIntN(64, tag.value));
      return buffer;
    }
    case 5: {
      const buffer = Buffer.alloc(4);
      buffer.writeFloatBE(tag.value);
      return buffer;
    }
    case 6: {
      const buffer = Buffer.alloc(8);
      buffer.writeDoubleBE(tag.value);
      return buffer;
    }
    case 7:
      return Buffer.concat([int(tag.value.length), Buffer.from(tag.value)]);
    case 8:
      return name(tag.value);
    case 9:
      return Buffer.concat([
        Buffer.from([tag.value.length ? tag.itemType : 0]),
        int(tag.value.length),
        ...tag.value.map(payload),
      ]);
    case 10:
      return Buffer.concat([
        ...Object.entries(tag.value).map(([key, child]) =>
          Buffer.concat([Buffer.from([child.type]), name(key), payload(child)]),
        ),
        Buffer.from([0]),
      ]);
    case 11:
      return Buffer.concat([int(tag.value.length), ...tag.value.map(int)]);
    case 12:
      return Buffer.concat([
        int(tag.value.length),
        ...tag.value.map((value) => payload({ type: 4, value })),
      ]);
  }
}

export function writeTestNbt(
  root: Record<string, TestTag>,
  rootName = "",
  compression: "gzip" | "none" = "gzip",
): Buffer {
  const raw = Buffer.concat([
    Buffer.from([10]),
    name(rootName),
    payload({ type: 10, value: root }),
  ]);
  return compression === "gzip" ? zlib.gzipSync(raw) : raw;
}

export function packLitematicStates(values: number[], bits: number): bigint[] {
  const longs = new Array<bigint>(Math.ceil((values.length * bits) / 64)).fill(
    0n,
  );
  values.forEach((value, index) => {
    for (let bit = 0; bit < bits; bit += 1) {
      if (!((value >> bit) & 1)) continue;
      const position = index * bits + bit;
      longs[Math.floor(position / 64)] |= 1n << BigInt(position % 64);
    }
  });
  return longs.map((value) => BigInt.asIntN(64, value));
}

export function encodeVarints(values: number[]): number[] {
  const bytes: number[] = [];
  for (let value of values) {
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value !== 0) byte |= 0x80;
      bytes.push(byte);
    } while (value !== 0);
  }
  return bytes;
}
