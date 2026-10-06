/**
 * Builders for synthetic chunks and region files used by the chunk editor
 * tests. Not a test file itself — vitest only picks up `*.test.ts`.
 */
import { TagType, serializeSync, setPrototypeOf } from "@xmcl/nbt";
import zlib from "zlib";
import {
  RegionWriteItem,
  buildRegionFile,
  compressionByte,
} from "./anvilRegion";
import { ChunkCompression } from "@/types/WorldChunks";

export interface FixtureSection {
  y: number;
  blocks?: string[];
  /** Palette index per block (y*256 + z*16 + x); omitted means uniform. */
  data?: number[];
  biomes?: string[];
  /** Biome palette index per 4×4×4 cell (64 entries). */
  biomeData?: number[];
}

export interface FlatChunkOptions {
  x: number;
  z: number;
  status?: string;
  inhabitedTime?: number;
  lastUpdate?: number;
  dataVersion?: number;
  sections?: FixtureSection[];
  blockEntities?: { id: string; x: number; y: number; z: number }[];
  structureStarts?: Record<string, string>;
  structureReferences?: Record<string, number[]>;
  lightOn?: boolean;
}

/** Packs palette indices the way 1.16+ does: entries never straddle a long. */
export function packIndices(indices: number[], bits: number): bigint[] {
  const perLong = Math.floor(64 / bits);
  const longs: bigint[] = [];

  for (let start = 0; start < indices.length; start += perLong) {
    let value = 0n;
    for (
      let slot = 0;
      slot < perLong && start + slot < indices.length;
      slot += 1
    ) {
      value |= BigInt(indices[start + slot]) << BigInt(slot * bits);
    }
    longs.push(BigInt.asIntN(64, value));
  }

  return longs;
}

/** Packs indices the pre-1.16 way: a continuous bit stream across longs. */
export function packIndicesSpanning(indices: number[], bits: number): bigint[] {
  const totalBits = indices.length * bits;
  const longs: bigint[] = new Array(Math.ceil(totalBits / 64)).fill(0n);

  for (let index = 0; index < indices.length; index += 1) {
    const offset = index * bits;
    const longIndex = Math.floor(offset / 64);
    const shift = BigInt(offset % 64);
    const value = BigInt(indices[index]);

    longs[longIndex] |= value << shift;
    if (offset % 64 > 64 - bits) {
      longs[longIndex + 1] |= value >> BigInt(64 - (offset % 64));
    }
  }

  return longs.map((value) => BigInt.asIntN(64, value));
}

export function bitsFor(size: number, minimum: number): number {
  return Math.max(minimum, Math.ceil(Math.log2(Math.max(1, size))));
}

const flatSchema = {
  DataVersion: TagType.Int,
  xPos: TagType.Int,
  zPos: TagType.Int,
  yPos: TagType.Int,
  Status: TagType.String,
  LastUpdate: TagType.Long,
  InhabitedTime: TagType.Long,
  isLightOn: TagType.Byte,
  block_entities: [
    {
      id: TagType.String,
      x: TagType.Int,
      y: TagType.Int,
      z: TagType.Int,
    },
  ],
  Heightmaps: {
    MOTION_BLOCKING: TagType.LongArray,
    WORLD_SURFACE: TagType.LongArray,
  },
};

function sectionSchema(section: FixtureSection) {
  return {
    Y: TagType.Byte,
    block_states: {
      palette: [{ Name: TagType.String }],
      ...(section.data ? { data: TagType.LongArray } : {}),
    },
    biomes: {
      palette: [TagType.String],
      ...(section.biomeData ? { data: TagType.LongArray } : {}),
    },
  };
}

/** A chunk in the 1.18+ layout, uncompressed NBT. */
export function flatChunkNbt(options: FlatChunkOptions): Buffer {
  const sectionSpecs = options.sections ?? [
    { y: 0, blocks: ["minecraft:stone"] },
  ];

  const sections = sectionSpecs.map((section) => {
    const blocks = section.blocks ?? ["minecraft:stone"];
    const biomes = section.biomes ?? ["minecraft:plains"];

    return {
      Y: section.y,
      block_states: {
        palette: blocks.map((Name) => ({ Name })),
        ...(section.data
          ? { data: packIndices(section.data, bitsFor(blocks.length, 4)) }
          : {}),
      },
      biomes: {
        palette: biomes,
        ...(section.biomeData
          ? { data: packIndices(section.biomeData, bitsFor(biomes.length, 1)) }
          : {}),
      },
    };
  });

  const starts: Record<string, { id: string }> = {};
  const startsSchema: Record<string, { id: number }> = {};
  for (const [name, id] of Object.entries(options.structureStarts ?? {})) {
    starts[name] = { id };
    startsSchema[name] = { id: TagType.String };
  }

  const references: Record<string, number[]> = {};
  const referencesSchema: Record<string, number> = {};
  for (const [name, refs] of Object.entries(
    options.structureReferences ?? {},
  )) {
    references[name] = refs;
    referencesSchema[name] = TagType.LongArray;
  }

  const chunk = {
    DataVersion: options.dataVersion ?? 3465,
    xPos: options.x,
    zPos: options.z,
    yPos: -4,
    Status: options.status ?? "minecraft:full",
    LastUpdate: options.lastUpdate ?? 1000,
    InhabitedTime: options.inhabitedTime ?? 0,
    isLightOn: options.lightOn === false ? 0 : 1,
    sections,
    block_entities: options.blockEntities ?? [],
    Heightmaps: { MOTION_BLOCKING: [1, 2], WORLD_SURFACE: [3] },
    structures: { starts, References: references },
  };

  // Lists share one schema, so every section is declared like the first.
  setPrototypeOf(chunk, {
    ...flatSchema,
    sections: [sectionSchema(sectionSpecs[0] ?? { y: 0 })],
    structures: { starts: startsSchema, References: referencesSchema },
  } as any);

  return Buffer.from(serializeSync(chunk));
}

export interface LevelChunkOptions {
  x: number;
  z: number;
  status?: string;
  inhabitedTime?: number;
  dataVersion?: number;
  entities?: string[];
  tileEntities?: { id: string; x: number; y: number; z: number }[];
  /** Palette-based sections with pre-1.16 (spanning) packing when set. */
  sections?: { y: number; blocks: string[]; data?: number[] }[];
}

/** A chunk in the pre-1.18 `Level` layout, uncompressed NBT. */
export function levelChunkNbt(options: LevelChunkOptions): Buffer {
  const dataVersion = options.dataVersion ?? 2586;
  const spanning = dataVersion < 2529;
  const sectionSpecs = options.sections ?? [
    { y: 0, blocks: ["minecraft:stone"] },
    { y: 1, blocks: ["minecraft:air"] },
  ];

  const chunk = {
    DataVersion: dataVersion,
    Level: {
      xPos: options.x,
      zPos: options.z,
      Status: options.status ?? "full",
      LastUpdate: 42,
      InhabitedTime: options.inhabitedTime ?? 0,
      Sections: sectionSpecs.map((section) => ({
        Y: section.y,
        Palette: section.blocks.map((Name) => ({ Name })),
        ...(section.data
          ? {
              BlockStates: spanning
                ? packIndicesSpanning(
                    section.data,
                    bitsFor(section.blocks.length, 4),
                  )
                : packIndices(section.data, bitsFor(section.blocks.length, 4)),
            }
          : {}),
      })),
      Entities: (options.entities ?? []).map((id) => ({ id })),
      TileEntities: options.tileEntities ?? [],
      Structures: { Starts: {}, References: {} },
    },
  };

  const hasData = Boolean(sectionSpecs[0]?.data);

  setPrototypeOf(chunk, {
    DataVersion: TagType.Int,
    Level: {
      xPos: TagType.Int,
      zPos: TagType.Int,
      Status: TagType.String,
      LastUpdate: TagType.Long,
      InhabitedTime: TagType.Long,
      Sections: [
        {
          Y: TagType.Byte,
          Palette: [{ Name: TagType.String }],
          ...(hasData ? { BlockStates: TagType.LongArray } : {}),
        },
      ],
      Entities: [{ id: TagType.String }],
      TileEntities: [
        { id: TagType.String, x: TagType.Int, y: TagType.Int, z: TagType.Int },
      ],
      Structures: { Starts: {}, References: {} },
    },
  } as any);

  return Buffer.from(serializeSync(chunk));
}

/** A pre-1.13 chunk with numeric block ids. */
export function legacyNumericChunkNbt(x: number, z: number): Buffer {
  const chunk = {
    DataVersion: 1343,
    Level: {
      xPos: x,
      zPos: z,
      Sections: [{ Y: 0, Blocks: new Array(4096).fill(1) }],
    },
  };

  setPrototypeOf(chunk, {
    DataVersion: TagType.Int,
    Level: {
      xPos: TagType.Int,
      zPos: TagType.Int,
      Sections: [{ Y: TagType.Byte, Blocks: TagType.ByteArray }],
    },
  } as any);

  return Buffer.from(serializeSync(chunk));
}

/** An `entities/` region chunk (1.17+). */
export function entityChunkNbt(x: number, z: number, ids: string[]): Buffer {
  const chunk = {
    DataVersion: 3465,
    Position: [x, z],
    Entities: ids.map((id) => ({ id })),
  };

  setPrototypeOf(chunk, {
    DataVersion: TagType.Int,
    Position: TagType.IntArray,
    Entities: [{ id: TagType.String }],
  } as any);

  return Buffer.from(serializeSync(chunk));
}

/** A `poi/` region chunk with the given number of records. */
export function poiChunkNbt(records: number): Buffer {
  const chunk = {
    DataVersion: 3465,
    Sections: {
      "4": {
        Valid: 1,
        Records: Array.from({ length: records }, (_, index) => ({
          type: "minecraft:home",
          free_tickets: 1,
          pos: [index, 64, 0],
        })),
      },
    },
  };

  setPrototypeOf(chunk, {
    DataVersion: TagType.Int,
    Sections: {
      "4": {
        Valid: TagType.Byte,
        Records: [
          {
            type: TagType.String,
            free_tickets: TagType.Int,
            pos: TagType.IntArray,
          },
        ],
      },
    },
  } as any);

  return Buffer.from(serializeSync(chunk));
}

export function heterogeneousChunkNbt(options: {
  x: number;
  z: number;
  palette: (string | { Name: string; Properties: Record<string, string> })[];
  data?: number[];
}): Buffer {
  const entries = options.palette.map((entry) =>
    typeof entry === "string" ? { "": entry } : entry,
  );
  const chunk = {
    DataVersion: 5023,
    xPos: options.x,
    zPos: options.z,
    Status: "minecraft:full",
    InhabitedTime: 0,
    sections: [
      {
        Y: 0,
        block_states: {
          palette: entries,
          ...(options.data
            ? { data: packIndices(options.data, bitsFor(entries.length, 4)) }
            : {}),
        },
        biomes: { palette: ["minecraft:plains"] },
      },
    ],
  };

  setPrototypeOf(chunk, {
    DataVersion: TagType.Int,
    xPos: TagType.Int,
    zPos: TagType.Int,
    Status: TagType.String,
    InhabitedTime: TagType.Long,
    sections: [
      {
        Y: TagType.Byte,
        block_states: {
          palette: [
            {
              "": TagType.String,
              Name: TagType.String,
              Properties: { level: TagType.String, snowy: TagType.String },
            },
          ],
          ...(options.data ? { data: TagType.LongArray } : {}),
        },
        biomes: { palette: [TagType.String] },
      },
    ],
  } as any);

  return Buffer.from(serializeSync(chunk));
}

function toSignedBytes(values: number[]): number[] {
  return values.map((value) => ((value & 0xff) << 24) >> 24);
}

function packNibbles(values: number[]): number[] {
  const bytes = new Array<number>(Math.ceil(values.length / 2)).fill(0);
  values.forEach((value, index) => {
    bytes[index >> 1] |= (value & 15) << ((index & 1) * 4);
  });
  return toSignedBytes(bytes);
}

export interface LegacyAnvilSection {
  y: number;
  ids: number[];
  data?: number[];
}

export function legacyAnvilChunkNbt(options: {
  x: number;
  z: number;
  sections: LegacyAnvilSection[];
  biomes?: number[];
  terrainPopulated?: boolean;
  dataVersion?: number;
}): Buffer {
  const hasAdd = options.sections.some((section) =>
    section.ids.some((id) => id > 255),
  );
  const chunk = {
    ...(options.dataVersion ? { DataVersion: options.dataVersion } : {}),
    Level: {
      xPos: options.x,
      zPos: options.z,
      LastUpdate: 10,
      InhabitedTime: 0,
      TerrainPopulated: options.terrainPopulated === false ? 0 : 1,
      Sections: options.sections.map((section) => ({
        Y: section.y,
        Blocks: toSignedBytes(section.ids),
        Data: packNibbles(section.data ?? new Array(4096).fill(0)),
        ...(hasAdd
          ? { Add: packNibbles(section.ids.map((id) => id >> 8)) }
          : {}),
      })),
      ...(options.biomes ? { Biomes: options.biomes } : {}),
      Entities: [],
      TileEntities: [],
    },
  };

  setPrototypeOf(chunk, {
    ...(options.dataVersion ? { DataVersion: TagType.Int } : {}),
    Level: {
      xPos: TagType.Int,
      zPos: TagType.Int,
      LastUpdate: TagType.Long,
      InhabitedTime: TagType.Long,
      TerrainPopulated: TagType.Byte,
      Sections: [
        {
          Y: TagType.Byte,
          Blocks: TagType.ByteArray,
          Data: TagType.ByteArray,
          ...(hasAdd ? { Add: TagType.ByteArray } : {}),
        },
      ],
      ...(options.biomes
        ? {
            Biomes:
              options.biomes.length === 1024
                ? TagType.IntArray
                : TagType.ByteArray,
          }
        : {}),
      Entities: [{ id: TagType.String }],
      TileEntities: [{ id: TagType.String }],
    },
  } as any);

  return Buffer.from(serializeSync(chunk));
}

export function mcRegionChunkNbt(options: {
  x: number;
  z: number;
  column: (x: number, z: number, y: number) => number;
  terrainPopulated?: boolean;
}): Buffer {
  const ids = new Array<number>(32768);
  for (let x = 0; x < 16; x += 1) {
    for (let z = 0; z < 16; z += 1) {
      for (let y = 0; y < 128; y += 1) {
        ids[(x << 11) | (z << 7) | y] = options.column(x, z, y);
      }
    }
  }

  const chunk = {
    Level: {
      xPos: options.x,
      zPos: options.z,
      LastUpdate: 5,
      TerrainPopulated: options.terrainPopulated === false ? 0 : 1,
      Blocks: toSignedBytes(ids),
      Data: packNibbles(new Array(32768).fill(0)),
      Entities: [{ id: "Pig" }],
      TileEntities: [
        { id: "Chest", x: options.x * 16, y: 64, z: options.z * 16 },
      ],
    },
  };

  setPrototypeOf(chunk, {
    Level: {
      xPos: TagType.Int,
      zPos: TagType.Int,
      LastUpdate: TagType.Long,
      TerrainPopulated: TagType.Byte,
      Blocks: TagType.ByteArray,
      Data: TagType.ByteArray,
      Entities: [{ id: TagType.String }],
      TileEntities: [
        { id: TagType.String, x: TagType.Int, y: TagType.Int, z: TagType.Int },
      ],
    },
  } as any);

  return Buffer.from(serializeSync(chunk));
}

export function levelDat(options: {
  version?: number;
  forgeBlocks?: Record<string, number>;
  forgeItemData?: Record<string, number>;
}): Buffer {
  const root: Record<string, unknown> = {
    Data: {
      LevelName: "World",
      ...(options.version ? { version: options.version } : {}),
    },
  };
  const schema: Record<string, unknown> = {
    Data: {
      LevelName: TagType.String,
      ...(options.version ? { version: TagType.Int } : {}),
    },
  };

  if (options.forgeBlocks || options.forgeItemData) {
    root.FML = {
      ...(options.forgeBlocks
        ? {
            Registries: {
              "minecraft:blocks": {
                ids: Object.entries(options.forgeBlocks).map(([K, V]) => ({
                  K,
                  V,
                })),
              },
            },
          }
        : {}),
      ...(options.forgeItemData
        ? {
            ItemData: Object.entries(options.forgeItemData).map(([K, V]) => ({
              K,
              V,
            })),
          }
        : {}),
    };
    schema.FML = {
      Registries: {
        "minecraft:blocks": { ids: [{ K: TagType.String, V: TagType.Int }] },
      },
      ItemData: [{ K: TagType.String, V: TagType.Int }],
    };
  }

  setPrototypeOf(root, schema as any);
  return zlib.gzipSync(Buffer.from(serializeSync(root)));
}

export function lz4Stream(data: Buffer, blockSize = 65536): Buffer {
  const header = (method: number, compressed: number, original: number) => {
    const bytes = Buffer.alloc(21);
    bytes.write("LZ4Block", 0, "latin1");
    bytes[8] = method | 6;
    bytes.writeInt32LE(compressed, 9);
    bytes.writeInt32LE(original, 13);
    return bytes;
  };

  const parts: Buffer[] = [];
  for (let start = 0; start < data.length; start += blockSize) {
    const literals = data.subarray(start, start + blockSize);
    const lengthBytes: number[] = [];
    let token = literals.length;
    if (token >= 15) {
      let rest = token - 15;
      token = 15;
      while (rest >= 255) {
        lengthBytes.push(255);
        rest -= 255;
      }
      lengthBytes.push(rest);
    }
    const block = Buffer.concat([
      Buffer.from([token << 4, ...lengthBytes]),
      literals,
    ]);
    parts.push(header(0x20, block.length, literals.length), block);
  }
  parts.push(header(0x10, 0, 0));

  return Buffer.concat(parts);
}

export function compressNbt(
  nbt: Buffer,
  kind: ChunkCompression = "zlib",
): Buffer {
  if (kind === "zlib") return zlib.deflateSync(nbt);
  if (kind === "gzip") return zlib.gzipSync(nbt);
  if (kind === "lz4") return lz4Stream(nbt);
  return nbt;
}

export interface RegionChunkSpec {
  index: number;
  nbt: Buffer;
  compression?: ChunkCompression;
  /** Overrides the compression byte, e.g. 4 for LZ4. */
  rawCompressionByte?: number;
  /** Uses these bytes as the payload instead of compressing `nbt`. */
  rawData?: Buffer;
  timestamp?: number;
}

export function regionFile(chunks: RegionChunkSpec[]): Buffer {
  const items: RegionWriteItem[] = chunks.map((spec) => {
    const kind = spec.compression ?? "zlib";
    return {
      index: spec.index,
      timestamp: spec.timestamp ?? 1_700_000_000,
      compressionByte: spec.rawCompressionByte ?? compressionByte(kind),
      data: spec.rawData ?? compressNbt(spec.nbt, kind),
    };
  });

  return buildRegionFile(items).file;
}

export function localIndex(x: number, z: number): number {
  return ((z & 31) << 5) | (x & 31);
}

/** Palette indices for a full section where every column is the same stack. */
export function columnStack(
  stack: (x: number, z: number, y: number) => number,
): number[] {
  const data = new Array<number>(4096);
  for (let y = 0; y < 16; y += 1) {
    for (let z = 0; z < 16; z += 1) {
      for (let x = 0; x < 16; x += 1) {
        data[(y << 8) | (z << 4) | x] = stack(x, z, y);
      }
    }
  }
  return data;
}
