import fs from "fs-extra";
import path from "path";
import {
  BakedBlock,
  BakedQuad,
  BlockModelSet,
  BlockTexture,
} from "@/types/Schematic";
import { BlockProps, parseBlockState } from "@/shared/blockState";
import { DEFAULT_TINT, paintForBlock, resolvePaint } from "@/shared/blockColors";
import {
  AssetSession,
  parseLenientJson,
  withAssetSession,
} from "./blockAssets";
import { bakeEntityModel, entityModelFor } from "./entityModels";

type Vec3 = [number, number, number];

export const DIRECTIONS = ["down", "up", "north", "south", "west", "east"] as const;
type DirectionName = (typeof DIRECTIONS)[number];

const VECTORS: Vec3[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

interface ModelFace {
  uv?: number[];
  texture?: string;
  cullface?: string;
  rotation?: number;
  tintindex?: number;
}

interface ModelElement {
  from: Vec3;
  to: Vec3;
  rotation?: {
    origin?: Vec3;
    axis?: string;
    angle?: number;
    rescale?: boolean;
  };
  faces?: Partial<Record<string, ModelFace>>;
  shade?: boolean;
}

export interface ResolvedModel {
  textures: Record<string, string>;
  elements: ModelElement[] | null;
  generated: boolean;
}

export interface VariantRef {
  model: string;
  x: number;
  y: number;
  uvlock: boolean;
  textures?: Record<string, string>;
}

export interface RawQuad {
  positions: number[];
  uvs: number[];
  texture: string;
  cull: number;
  shade: number;
  tinted: boolean;
}

const AIR_LIKE = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:structure_void",
  "minecraft:light",
  "minecraft:barrier",
  "minecraft:moving_piston",
]);

const LIQUIDS: Record<string, "water" | "lava"> = {
  "minecraft:water": "water",
  "minecraft:flowing_water": "water",
  "minecraft:bubble_column": "water",
  "minecraft:lava": "lava",
  "minecraft:flowing_lava": "lava",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function splitRef(ref: string): [string, string] {
  const at = ref.indexOf(":");
  return at === -1
    ? ["minecraft", ref]
    : [ref.slice(0, at) || "minecraft", ref.slice(at + 1)];
}

function modelPath(ref: string): [string, string] {
  const [namespace, rest] = splitRef(ref);
  return [namespace, rest.includes("/") ? rest : `block/${rest}`];
}

function textureName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.sprite === "string") return value.sprite;
  return null;
}

export function resolveTexture(
  textures: Record<string, string>,
  reference: string | undefined,
): string | null {
  let current = reference;
  for (let step = 0; step < 16 && current; step += 1) {
    if (!current.startsWith("#")) return current;
    current = textures[current.slice(1)];
  }
  return null;
}

function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const numbers = value.slice(0, 3).map(Number);
  return numbers.every(Number.isFinite) ? (numbers as Vec3) : null;
}

function readElements(value: unknown): ModelElement[] | null {
  if (!Array.isArray(value)) return null;
  const elements: ModelElement[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const from = vec3(raw.from);
    const to = vec3(raw.to);
    if (!from || !to) continue;
    elements.push({
      from,
      to,
      rotation: isRecord(raw.rotation)
        ? {
            origin: vec3(raw.rotation.origin) ?? [8, 8, 8],
            axis: typeof raw.rotation.axis === "string" ? raw.rotation.axis : "y",
            angle: Number(raw.rotation.angle) || 0,
            rescale: raw.rotation.rescale === true,
          }
        : undefined,
      faces: isRecord(raw.faces) ? (raw.faces as ModelElement["faces"]) : {},
      shade: raw.shade !== false,
    });
  }
  return elements;
}

export class ModelLibrary {
  private readonly models = new Map<string, Promise<ResolvedModel | null>>();
  private readonly json = new Map<string, Promise<unknown>>();
  private readonly pngs = new Map<string, Promise<Buffer | null>>();

  constructor(readonly session: AssetSession) {}

  readJson(namespace: string, file: string): Promise<unknown> {
    const key = `${namespace}:${file}`;
    let pending = this.json.get(key);
    if (!pending) {
      pending = (async () => {
        for (const jar of await this.session.jarsFor(namespace)) {
          const data = await jar.read(`assets/${namespace}/${file}`);
          if (data) return parseLenientJson(data);
        }
        return null;
      })();
      this.json.set(key, pending);
    }
    return pending;
  }

  texture(ref: string): Promise<Buffer | null> {
    let pending = this.pngs.get(ref);
    if (!pending) {
      const [namespace, file] = splitRef(ref);
      pending = (async () => {
        for (const jar of await this.session.jarsFor(namespace)) {
          const data = await jar.read(`assets/${namespace}/textures/${file}.png`);
          if (data) return data;
        }
        return null;
      })();
      this.pngs.set(ref, pending);
    }
    return pending;
  }

  model(ref: string, depth = 0): Promise<ResolvedModel | null> {
    const [namespace, file] = modelPath(ref);
    const key = `${namespace}:${file}`;
    let pending = this.models.get(key);
    if (!pending) {
      pending = this.loadModel(namespace, file, depth);
      this.models.set(key, pending);
    }
    return pending;
  }

  private async loadModel(
    namespace: string,
    file: string,
    depth: number,
  ): Promise<ResolvedModel | null> {
    if (file === "builtin/generated") {
      return { textures: {}, elements: null, generated: true };
    }
    if (file.startsWith("builtin/")) {
      return { textures: {}, elements: null, generated: false };
    }
    const json = await this.readJson(namespace, `models/${file}.json`);
    if (!isRecord(json) || depth > 24) return null;

    const parent =
      typeof json.parent === "string"
        ? await this.model(json.parent, depth + 1)
        : null;
    const textures: Record<string, string> = { ...parent?.textures };
    if (isRecord(json.textures)) {
      for (const [key, value] of Object.entries(json.textures)) {
        const name = textureName(value);
        if (name) textures[key] = name;
      }
    }
    return {
      textures,
      elements: readElements(json.elements) ?? parent?.elements ?? null,
      generated: parent?.generated ?? false,
    };
  }

  async blockstate(id: string): Promise<unknown> {
    const [namespace, file] = splitRef(id);
    return this.readJson(namespace, `blockstates/${file}.json`);
  }
}

function variantRef(value: unknown): VariantRef | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!isRecord(raw) || typeof raw.model !== "string") return null;
  return {
    model: raw.model,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    uvlock: raw.uvlock === true,
  };
}

function whenMatches(when: unknown, props: BlockProps): boolean {
  if (!isRecord(when)) return true;
  if (Array.isArray(when.OR)) return when.OR.some((part) => whenMatches(part, props));
  if (Array.isArray(when.AND)) return when.AND.every((part) => whenMatches(part, props));
  return Object.entries(when).every(([key, value]) => {
    const actual = props[key];
    if (actual === undefined) return false;
    return String(value).split("|").includes(actual);
  });
}

function forgeVariants(json: Record<string, unknown>, props: BlockProps): VariantRef[] {
  const defaults = isRecord(json.defaults) ? json.defaults : {};
  const merged: Record<string, unknown> = { ...defaults };
  const textures: Record<string, string> = {};
  const absorb = (raw: unknown) => {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!isRecord(value)) return;
    if (isRecord(value.textures)) {
      for (const [key, texture] of Object.entries(value.textures)) {
        const name = textureName(texture);
        if (name) textures[key] = name;
      }
    }
    for (const key of ["model", "x", "y", "uvlock"]) {
      if (value[key] !== undefined) merged[key] = value[key];
    }
  };
  absorb(defaults);
  const variants = isRecord(json.variants) ? json.variants : {};
  absorb(variants.normal);
  for (const [key, value] of Object.entries(props)) {
    const group = variants[key];
    if (isRecord(group)) absorb(group[value]);
  }
  if (typeof merged.model !== "string") return [];
  return [
    {
      model: merged.model,
      x: Number(merged.x) || 0,
      y: Number(merged.y) || 0,
      uvlock: merged.uvlock === true,
      textures,
    },
  ];
}

export function selectVariants(json: unknown, props: BlockProps): VariantRef[] {
  if (!isRecord(json)) return [];
  if (json.forge_marker !== undefined) return forgeVariants(json, props);

  if (isRecord(json.variants)) {
    let best: VariantRef | null = null;
    let bestScore = -Infinity;
    let first: VariantRef | null = null;
    for (const [key, value] of Object.entries(json.variants)) {
      const ref = variantRef(value);
      if (!ref) continue;
      first ??= ref;
      let score = 0;
      let failed = false;
      if (key && key !== "normal") {
        for (const pair of key.split(",")) {
          const [name, expected] = pair.split("=");
          const actual = props[name];
          if (actual === undefined) score -= 1;
          else if (actual === expected) score += 10;
          else failed = true;
        }
      }
      if (!failed && score > bestScore) {
        best = ref;
        bestScore = score;
      }
    }
    const chosen = best ?? first;
    return chosen ? [chosen] : [];
  }

  if (Array.isArray(json.multipart)) {
    const parts: VariantRef[] = [];
    for (const part of json.multipart) {
      if (!isRecord(part) || !whenMatches(part.when, props)) continue;
      const ref = variantRef(part.apply);
      if (ref) parts.push(ref);
    }
    return parts;
  }

  return [];
}

function faceVertices(direction: number, from: Vec3, to: Vec3): Vec3[] {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  switch (direction) {
    case 0:
      return [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]];
    case 1:
      return [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]];
    case 2:
      return [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]];
    case 3:
      return [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]];
    case 4:
      return [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]];
    default:
      return [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]];
  }
}

export function defaultUv(direction: number, from: Vec3, to: Vec3): number[] {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  switch (direction) {
    case 0:
      return [x0, 16 - z1, x1, 16 - z0];
    case 1:
      return [x0, z0, x1, z1];
    case 2:
      return [16 - x1, 16 - y1, 16 - x0, 16 - y0];
    case 3:
      return [x0, 16 - y1, x1, 16 - y0];
    case 4:
      return [z0, 16 - y1, z1, 16 - y0];
    default:
      return [16 - z1, 16 - y1, 16 - z0, 16 - y0];
  }
}

function rotateAround(point: Vec3, origin: Vec3, axis: string, degrees: number, rescale = false): Vec3 {
  const radians = (degrees * Math.PI) / 180;
  const quarter = Math.abs(degrees % 90) < 1e-6;
  const cos = quarter ? Math.round(Math.cos(radians)) : Math.cos(radians);
  const sin = quarter ? Math.round(Math.sin(radians)) : Math.sin(radians);
  const scale = rescale && !quarter ? 1 / Math.abs(Math.cos(radians)) : 1;
  const x = point[0] - origin[0];
  const y = point[1] - origin[1];
  const z = point[2] - origin[2];
  let out: Vec3;
  if (axis === "x") out = [x, (y * cos - z * sin) * scale, (y * sin + z * cos) * scale];
  else if (axis === "z") out = [(x * cos - y * sin) * scale, (x * sin + y * cos) * scale, z];
  else out = [(x * cos + z * sin) * scale, y, (-x * sin + z * cos) * scale];
  return [out[0] + origin[0], out[1] + origin[1], out[2] + origin[2]];
}

const CENTER: Vec3 = [8, 8, 8];

function rotateState(point: Vec3, ref: VariantRef): Vec3 {
  let out = point;
  if (ref.x) out = rotateAround(out, CENTER, "x", -ref.x);
  if (ref.y) out = rotateAround(out, CENTER, "y", -ref.y);
  return out;
}

function directionOf(vector: Vec3): number {
  let best = 1;
  let bestDot = -Infinity;
  VECTORS.forEach((candidate, index) => {
    const dot = candidate[0] * vector[0] + candidate[1] * vector[1] + candidate[2] * vector[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = index;
    }
  });
  return best;
}

function rotateDirection(direction: number, ref: VariantRef): number {
  const tip = rotateState(
    [8 + VECTORS[direction][0], 8 + VECTORS[direction][1], 8 + VECTORS[direction][2]],
    ref,
  );
  return directionOf([tip[0] - 8, tip[1] - 8, tip[2] - 8]);
}

function normalOf(points: Vec3[]): Vec3 {
  const [a, b, c] = points;
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function uvCorners(uv: number[], rotation: number): number[] {
  const [u0, v0, u1, v1] = uv;
  const corners = [
    [u0, v0],
    [u0, v1],
    [u1, v1],
    [u1, v0],
  ];
  const shift = (((Math.round(rotation / 90) % 4) + 4) % 4);
  const out: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const [u, v] = corners[(index + shift) % 4];
    out.push(u / 16, v / 16);
  }
  return out;
}

function isFullCube(elements: ModelElement[]): boolean {
  return elements.some(
    (element) =>
      !element.rotation?.angle &&
      element.from.every((value) => value <= 0) &&
      element.to.every((value) => value >= 16) &&
      DIRECTIONS.every((name) => element.faces?.[name]?.texture),
  );
}

export function bakeElements(
  elements: ModelElement[],
  textures: Record<string, string>,
  ref: VariantRef,
): RawQuad[] {
  const quads: RawQuad[] = [];
  const rotated = ref.x !== 0 || ref.y !== 0;

  for (const element of elements) {
    const rotation = element.rotation;
    for (const [faceName, face] of Object.entries(element.faces ?? {})) {
      const direction = DIRECTIONS.indexOf(faceName as DirectionName);
      if (direction < 0 || !face) continue;
      const texture = resolveTexture(textures, face.texture);
      if (!texture) continue;

      let points = faceVertices(direction, element.from, element.to);
      let uv = face.uv?.length === 4 ? face.uv : defaultUv(direction, element.from, element.to);
      let faceRotation = Number(face.rotation) || 0;

      if (rotation?.angle) {
        points = points.map((point) =>
          rotateAround(point, rotation.origin ?? CENTER, rotation.axis ?? "y", rotation.angle ?? 0, rotation.rescale),
        );
      }

      if (rotated) {
        if (ref.uvlock && !rotation?.angle) {
          const corners = [element.from, element.to].map((point) => rotateState(point, ref));
          const low: Vec3 = [0, 1, 2].map((axis) => Math.min(corners[0][axis], corners[1][axis])) as Vec3;
          const high: Vec3 = [0, 1, 2].map((axis) => Math.max(corners[0][axis], corners[1][axis])) as Vec3;
          const turned = rotateDirection(direction, ref);
          points = faceVertices(turned, low, high);
          uv = defaultUv(turned, low, high);
          faceRotation = 0;
        } else {
          points = points.map((point) => rotateState(point, ref));
        }
      }

      const cullName = face.cullface === "bottom" ? "down" : face.cullface === "top" ? "up" : face.cullface;
      const cullIndex = cullName ? DIRECTIONS.indexOf(cullName as DirectionName) : -1;
      quads.push({
        positions: points.flatMap((point) => point.map((value) => value / 16)),
        uvs: uvCorners(uv, faceRotation),
        texture,
        cull: cullIndex < 0 ? -1 : rotated ? rotateDirection(cullIndex, ref) : cullIndex,
        shade: element.shade === false ? -1 : directionOf(normalOf(points)),
        tinted: face.tintindex !== undefined && Number(face.tintindex) >= 0,
      });
    }
  }
  return quads;
}

export function tintOf(name: string): number | null {
  const id = name.slice(name.indexOf(":") + 1);
  if (/^(cherry|azalea|flowering_azalea)_leaves$/.test(id)) return null;
  if (/water|bubble_column/.test(id)) return 0x3f76e4;
  if (id === "pale_oak_leaves") return 0x878d76;
  if (id === "mangrove_leaves") return 0x8db127;
  if (id === "spruce_leaves") return 0x619961;
  if (id === "birch_leaves") return 0x80a755;
  if (id === "lily_pad") return 0x208030;
  if (id === "redstone_wire") return 0xb01010;
  if (/stem$/.test(id)) return 0xa0b040;
  if (/leaves|vine/.test(id)) return 0x48b518;
  return 0x91bd59;
}

function box(from: Vec3, to: Vec3): ModelElement {
  const faces: Record<string, ModelFace> = {};
  DIRECTIONS.forEach((name) => {
    faces[name] = { texture: "#all", cullface: name };
  });
  return { from, to, faces, shade: true };
}

function entityBox(name: string): ModelElement {
  const id = name.slice(name.indexOf(":") + 1);
  if (/chest$/.test(id)) return box([1, 0, 1], [15, 14, 15]);
  if (/_bed$/.test(id)) return box([0, 0, 0], [16, 9, 16]);
  if (/(head|skull)$/.test(id)) return box([4, 0, 4], [12, 8, 12]);
  if (/sign$|banner$/.test(id)) return box([1, 6, 7], [15, 16, 9]);
  if (id === "decorated_pot") return box([1, 0, 1], [15, 16, 15]);
  if (id === "conduit") return box([5, 5, 5], [11, 11, 11]);
  return box([0, 0, 0], [16, 16, 16]);
}

const CUBE: VariantRef = { model: "", x: 0, y: 0, uvlock: false };

export interface BakedState {
  quads: RawQuad[];
  cube: boolean;
  liquid: boolean;
  color: [number, number, number] | null;
}

async function guessTexture(library: ModelLibrary, name: string): Promise<string | null> {
  const [namespace, file] = splitRef(name);
  for (const candidate of [`${namespace}:block/${file}`, `${namespace}:blocks/${file}`]) {
    if (await library.texture(candidate)) return candidate;
  }
  return null;
}

export async function bakeState(library: ModelLibrary, state: string): Promise<BakedState> {
  const { name, props } = parseBlockState(state);
  const empty: BakedState = { quads: [], cube: false, liquid: false, color: null };
  if (AIR_LIKE.has(name)) return empty;

  const liquid = LIQUIDS[name];
  if (liquid) {
    const texture = `minecraft:block/${liquid}_still`;
    const legacy = `minecraft:blocks/${liquid}_still`;
    const chosen = (await library.texture(texture)) ? texture : legacy;
    const quads = bakeElements([box([0, 0, 0], [16, 14, 16])], { all: chosen }, CUBE);
    for (const quad of quads) quad.tinted = liquid === "water";
    return { quads, cube: false, liquid: true, color: null };
  }

  const quads: RawQuad[] = [];
  let cube = false;
  let particle: string | null = null;

  for (const ref of selectVariants(await library.blockstate(name), props)) {
    const model = await library.model(ref.model);
    if (!model) continue;
    const textures = { ...model.textures, ...ref.textures };
    particle ??= resolveTexture(textures, "#particle");
    if (!model.elements?.length) continue;
    quads.push(...bakeElements(model.elements, textures, ref));
    cube ||= isFullCube(model.elements);
  }

  if (!quads.length) {
    const entity = entityModelFor(name, props);
    if (entity && (await library.texture(entity.texture))) {
      return { quads: bakeEntityModel(entity), cube: false, liquid: false, color: null };
    }
  }

  if (!quads.length) {
    const texture = particle ?? (await guessTexture(library, name));
    if (texture) {
      const element = entityBox(particle ? name : "full");
      quads.push(...bakeElements([element], { all: texture }, CUBE));
      cube = element.from.every((value) => value === 0) && element.to.every((value) => value === 16);
    }
  }

  if (!quads.length) {
    const paint = resolvePaint(paintForBlock(name), DEFAULT_TINT);
    if (!paint) return empty;
    const quadsOfColor = bakeElements([box([0, 0, 0], [16, 16, 16])], { all: `color/${name}` }, CUBE);
    return { quads: quadsOfColor, cube: true, liquid: false, color: [...paint] as [number, number, number] };
  }

  return { quads, cube, liquid: false, color: null };
}

export async function bakeBlockModels(versionPath: string, states: string[]): Promise<BlockModelSet> {
  return withAssetSession(versionPath, async (session) => {
    const library = new ModelLibrary(session);
    const textureIndex = new Map<string, number>();
    const textures: BlockTexture[] = [];
    const blocks: BakedBlock[] = [];

    const register = async (texture: string, color: [number, number, number] | null) => {
      let index = textureIndex.get(texture);
      if (index !== undefined) return index;
      const png = color ? null : await library.texture(texture);
      index = textures.length;
      textures.push({
        name: texture,
        png: png ? new Uint8Array(png.buffer, png.byteOffset, png.byteLength) : null,
        color,
      });
      textureIndex.set(texture, index);
      return index;
    };

    for (const state of states) {
      const baked = await bakeState(library, state).catch(() => null);
      if (!baked) {
        blocks.push({ quads: [], cube: false, liquid: false, missing: true });
        continue;
      }
      const name = parseBlockState(state).name;
      const tint = tintOf(name);
      const quads: BakedQuad[] = [];
      for (const quad of baked.quads) {
        quads.push({
          positions: quad.positions,
          uvs: quad.uvs,
          texture: await register(quad.texture, baked.color),
          cull: quad.cull,
          shade: quad.shade,
          tint: quad.tinted && tint !== null ? tint : -1,
        });
      }
      blocks.push({
        quads,
        cube: baked.cube,
        liquid: baked.liquid,
        missing: baked.color !== null,
      });
    }

    return { textures, blocks, vanillaSource: session.gameSource };
  });
}

type AssetIndex = { objects?: Record<string, { hash?: unknown }> } | null;
const assetIndexes = new Map<string, Promise<AssetIndex>>();

export async function readAssetIndexObject(indexPath: string, name: string): Promise<Buffer | null> {
  let pending = assetIndexes.get(indexPath);
  if (!pending) {
    pending = fs.readJson(indexPath).catch(() => null) as Promise<AssetIndex>;
    assetIndexes.set(indexPath, pending);
    if (assetIndexes.size > 4) assetIndexes.delete(assetIndexes.keys().next().value!);
  }
  const index = await pending;
  const hash = index?.objects?.[name]?.hash;
  if (typeof hash !== "string" || !/^[0-9a-f]{40}$/.test(hash)) return null;
  const objects = path.join(path.dirname(path.dirname(indexPath)), "objects");
  return fs.readFile(path.join(objects, hash.slice(0, 2), hash)).catch(() => null);
}
