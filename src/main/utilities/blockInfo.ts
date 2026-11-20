import fs from "fs-extra";
import path from "path";
import { BlockInfo } from "@/types/Schematic";
import {
  blockBaseId,
  minecraftLocale,
  readableBlockId,
} from "@/shared/blockState";
import {
  CubeFaces,
  IsoTexture,
  createRaster,
  drawCube,
  drawSprite,
} from "@/shared/isometricBlock";
import {
  AssetSession,
  JarAssets,
  decodePng,
  encodeRgbaPng,
  parseLenientJson,
  withAssetSession,
  writeAtomically,
} from "./blockAssets";
import {
  ModelLibrary,
  ResolvedModel,
  readAssetIndexObject,
  resolveTexture,
  selectVariants,
  splitRef,
  tintOf,
} from "./blockModels";
import { getLauncherPaths } from "./other";

const ICON_FOLDER = "block-icons";
const ICON_VERSION = 1;
const ICON_SIZE = 64;
const CUBE_SCALE = 0.84;
const MAX_LANG_TABLES = 24;

type LangTable = Map<string, string>;
const langTables = new Map<string, Promise<LangTable>>();

function parseLegacyLang(text: string): LangTable {
  const table: LangTable = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at > 0) table.set(line.slice(0, at), line.slice(at + 1));
  }
  return table;
}

function absorb(target: LangTable, data: Buffer | null, legacy: boolean) {
  if (!data) return;
  if (legacy) {
    for (const [key, value] of parseLegacyLang(data.toString("utf8"))) {
      if (!target.has(key)) target.set(key, value);
    }
    return;
  }
  const json = parseLenientJson(data);
  if (typeof json !== "object" || json === null) return;
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === "string" && !target.has(key)) target.set(key, value);
  }
}

async function loadLangTable(
  session: AssetSession,
  jars: JarAssets[],
  namespace: string,
  locale: string,
): Promise<LangTable> {
  const table: LangTable = new Map();
  for (const jar of jars) {
    absorb(table, await jar.read(`assets/${namespace}/lang/${locale}.json`), false);
    absorb(table, await jar.read(`assets/${namespace}/lang/${locale}.lang`), true);
  }
  if (namespace === "minecraft" && session.assetIndex && locale !== "en_us") {
    absorb(
      table,
      await readAssetIndexObject(session.assetIndex, `minecraft/lang/${locale}.json`),
      false,
    );
    absorb(
      table,
      await readAssetIndexObject(session.assetIndex, `minecraft/lang/${locale}.lang`),
      true,
    );
  }
  return table;
}

function langTable(
  session: AssetSession,
  jars: JarAssets[],
  namespace: string,
  locale: string,
): Promise<LangTable> {
  const key = [namespace, locale, session.assetIndex ?? "", ...jars.map((jar) => jar.key)].join("|");
  let pending = langTables.get(key);
  if (!pending) {
    pending = loadLangTable(session, jars, namespace, locale);
    langTables.set(key, pending);
    if (langTables.size > MAX_LANG_TABLES) {
      langTables.delete(langTables.keys().next().value!);
    }
  }
  return pending;
}

function camel(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

export function translationKeys(id: string): string[] {
  const [namespace, file] = splitRef(blockBaseId(id));
  const dotted = file.replace(/\//g, ".");
  return [
    `block.${namespace}.${dotted}`,
    `item.${namespace}.${dotted}`,
    `tile.${file}.name`,
    `tile.${namespace}.${file}.name`,
    `tile.${namespace}:${file}.name`,
    `tile.${camel(file)}.name`,
    `tile.${namespace}.${camel(file)}.name`,
    `item.${file}.name`,
  ];
}

export function translateBlock(id: string, tables: LangTable[]): string | null {
  const keys = translationKeys(id);
  for (const table of tables) {
    for (const key of keys) {
      const value = table.get(key)?.trim();
      if (value) return value.replace(/§./g, "");
    }
  }
  return null;
}

function firstFrame(image: IsoTexture): IsoTexture {
  const { width, height } = image;
  if (height <= width || height % width !== 0) return image;
  return { width, height: width, pixels: image.pixels.slice(0, width * width * 4) };
}

function tinted(image: IsoTexture, rgb: number | null): IsoTexture {
  if (rgb === null) return image;
  const pixels = new Uint8ClampedArray(image.pixels);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = (pixels[index] * r) / 255;
    pixels[index + 1] = (pixels[index + 1] * g) / 255;
    pixels[index + 2] = (pixels[index + 2] * b) / 255;
  }
  return { ...image, pixels };
}

function overlay(base: IsoTexture, top: IsoTexture): IsoTexture {
  if (base.width !== top.width || base.height !== top.height) return base;
  const pixels = new Uint8ClampedArray(base.pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = top.pixels[index + 3] / 255;
    if (alpha === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[index + channel] =
        top.pixels[index + channel] * alpha + pixels[index + channel] * (1 - alpha);
    }
    pixels[index + 3] = Math.max(pixels[index + 3], top.pixels[index + 3]);
  }
  return { ...base, pixels };
}

async function loadTexture(
  library: ModelLibrary,
  ref: string | null,
  tint: number | null,
): Promise<IsoTexture | null> {
  if (!ref) return null;
  const data = await library.texture(ref);
  const image = data ? decodePng(data) : null;
  return image ? tinted(firstFrame(image), tint) : null;
}

export type IconSubject =
  | { kind: "cube"; faces: CubeFaces }
  | { kind: "sprite"; texture: IsoTexture };

async function spriteOf(
  library: ModelLibrary,
  model: ResolvedModel,
  tint: number | null,
): Promise<IconSubject | null> {
  let texture = await loadTexture(library, model.textures.layer0 ?? null, tint);
  if (!texture) return null;
  for (let layer = 1; layer < 4; layer += 1) {
    const extra = await loadTexture(library, model.textures[`layer${layer}`] ?? null, null);
    if (extra) texture = overlay(texture, extra);
  }
  return { kind: "sprite", texture };
}

async function cubeOf(
  library: ModelLibrary,
  model: ResolvedModel,
  textures: Record<string, string>,
  tint: number | null,
): Promise<IconSubject | null> {
  const elements = model.elements ?? [];
  if (!elements.length) return null;
  const volume = (element: (typeof elements)[number]) =>
    Math.abs((element.to[0] - element.from[0]) * (element.to[1] - element.from[1]) * (element.to[2] - element.from[2]));
  const main = elements.reduce((best, element) => (volume(element) > volume(best) ? element : best));
  const faces = main.faces ?? {};
  const face = async (...names: string[]) => {
    for (const name of names) {
      const entry = faces[name];
      const ref = resolveTexture(textures, entry?.texture);
      const texture = await loadTexture(library, ref, entry && Number(entry.tintindex ?? -1) >= 0 ? tint : null);
      if (texture) return texture;
    }
    return null;
  };
  const top = await face("up", "north", "south", "east", "west");
  const front = await face("north", "south", "west", "east", "up");
  const side = await face("east", "west", "south", "north", "up");
  if (!top || !front || !side) return null;
  const height = Math.max(...elements.map((element) => Math.max(element.from[1], element.to[1])));
  return {
    kind: "cube",
    faces: { top, front, side, tall: Math.min(1, Math.max(0.25, height / 16)) },
  };
}

async function itemModelRef(library: ModelLibrary, id: string): Promise<string> {
  const [namespace, file] = splitRef(id);
  const definition = await library.readJson(namespace, `items/${file}.json`);
  let node = (definition as { model?: unknown } | null)?.model;
  for (let step = 0; step < 6 && node && typeof node === "object"; step += 1) {
    const value = node as Record<string, unknown>;
    if (typeof value.model === "string") return value.model;
    if (typeof value.base === "string") return value.base;
    const cases = Array.isArray(value.cases) ? (value.cases[0] as { model?: unknown })?.model : undefined;
    node = value.on_false ?? value.fallback ?? cases ?? (Array.isArray(value.entries) ? (value.entries[0] as { model?: unknown })?.model : undefined) ?? value.model;
  }
  return `${namespace}:item/${file}`;
}

export async function iconSubject(library: ModelLibrary, id: string): Promise<IconSubject | null> {
  const name = blockBaseId(id);
  const tint = tintOf(name);
  const [namespace, file] = splitRef(name);

  const item = await library.model(await itemModelRef(library, name));
  if (item) {
    if (item.generated || (!item.elements?.length && item.textures.layer0)) {
      const sprite = await spriteOf(library, item, /grass|fern|leaves|vine|lily_pad/.test(file) ? tint : null);
      if (sprite) return sprite;
    } else if (item.elements?.length) {
      const cube = await cubeOf(library, item, item.textures, tint);
      if (cube) return cube;
    }
  }

  for (const ref of selectVariants(await library.blockstate(name), {})) {
    const model = await library.model(ref.model);
    if (!model) continue;
    const cube = await cubeOf(library, model, model.textures, tint);
    if (cube) return cube;
    const particle = await loadTexture(
      library,
      resolveTexture(model.textures, "#particle"),
      /water|bubble_column/.test(file) ? tint : null,
    );
    if (particle) return { kind: "cube", faces: { top: particle, front: particle, side: particle } };
  }

  for (const ref of [`${namespace}:item/${file}`, `${namespace}:items/${file}`]) {
    const texture = await loadTexture(library, ref, null);
    if (texture) return { kind: "sprite", texture };
  }
  for (const ref of [`${namespace}:block/${file}`, `${namespace}:blocks/${file}`]) {
    const texture = await loadTexture(library, ref, null);
    if (texture) return { kind: "cube", faces: { top: texture, front: texture, side: texture } };
  }
  return null;
}

export function renderIcon(subject: IconSubject): Buffer {
  const raster = createRaster(ICON_SIZE);
  if (subject.kind === "cube") drawCube(raster, subject.faces, CUBE_SCALE, false);
  else drawSprite(raster, subject.texture, false);
  return encodeRgbaPng(raster.pixels, ICON_SIZE, ICON_SIZE);
}

function iconFile(jar: JarAssets, id: string): string {
  return path.join(
    getLauncherPaths().cache,
    ICON_FOLDER,
    `v${ICON_VERSION}-${jar.key}`,
    blockBaseId(id).replace(/[^a-z0-9_.-]/gi, "_"),
  );
}

async function cachedIcon(
  library: ModelLibrary,
  jars: JarAssets[],
  id: string,
): Promise<Buffer | null> {
  const owner = jars[0];
  if (!owner) return null;
  const base = iconFile(owner, id);
  const hit = await fs.readFile(`${base}.png`).catch(() => null);
  if (hit) return hit;
  if (await fs.pathExists(`${base}.none`)) return null;

  const subject = await iconSubject(library, id).catch(() => null);
  if (!subject) {
    await writeAtomically(`${base}.none`, Buffer.alloc(0)).catch(() => undefined);
    return null;
  }
  const png = renderIcon(subject);
  await writeAtomically(`${base}.png`, png).catch(() => undefined);
  return png;
}

export async function describeWithSession(
  session: AssetSession,
  ids: string[],
  locale: string,
): Promise<Record<string, BlockInfo>> {
  const library = new ModelLibrary(session);
  const mcLocale = minecraftLocale(locale);
  const result: Record<string, BlockInfo> = {};

  for (const id of ids) {
    const name = blockBaseId(id);
    const [namespace] = splitRef(name);
    const jars = await session.jarsFor(namespace);
    const tables = [await langTable(session, jars, namespace, mcLocale)];
    if (mcLocale !== "en_us") tables.push(await langTable(session, jars, namespace, "en_us"));
    const icon = await cachedIcon(library, jars, name).catch(() => null);
    result[id] = {
      name: translateBlock(name, tables) ?? readableBlockId(name),
      icon: icon ? `data:image/png;base64,${icon.toString("base64")}` : null,
    };
  }
  return result;
}

export function describeBlocks(
  versionPath: string,
  ids: string[],
  locale: string,
): Promise<Record<string, BlockInfo>> {
  return withAssetSession(versionPath, (session) =>
    describeWithSession(session, [...new Set(ids)], locale),
  );
}
