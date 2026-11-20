import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { randomUUID } from "crypto";
import { BrowserWindow, session, type DownloadItem as ElectronDownload } from "electron";
import type { IVersionConf } from "@/types/IVersion";
import type { IVersionManifest } from "@/types/IVersionManifest";
import {
  OPTIFINE_DOWNLOADS_URL,
  OPTIFINE_HOST,
  OPTIFINE_SITE,
  type OptiFineBuild,
  type OptiFineChoice,
  isOptiFineChoice,
  isOptiFineFileName,
  optifineAdPageUrl,
  optifineLibraryVersion,
  optifineOffer,
  parseOptiFineDownloads,
  parseOptiFineFile,
  readOptiFineVersion,
} from "@/shared/optifine";
import { getDataRoot } from "../utilities/dataRoot";
import { readEntryData, withArchive } from "../utilities/archiver";
import { runJar } from "../utilities/game";
import { mainWindow } from "../windows/mainWindow";

type ManifestLibrary = IVersionManifest["libraries"][number];

export const OPTIFINE_FILE_MISSING = "optifineFileMissing";
export const OPTIFINE_INVALID_FILE = "optifineInvalidFile";
export const OPTIFINE_WRONG_VERSION = "optifineWrongVersion";
export const OPTIFINE_PATCH_FAILED = "optifinePatchFailed";
export const OPTIFINE_SITE_UNAVAILABLE = "optifineSiteUnavailable";

export const OPTIFINE_TWEAKER = "optifine.OptiFineTweaker";
const LAUNCHWRAPPER_MAIN = "net.minecraft.launchwrapper.Launch";
const LAUNCHWRAPPER_PREFIX = "net.minecraft.launchwrapper.";
const OPTIFINE_LIBRARY = "optifine:OptiFine:";
const OPTIFINE_LAUNCHWRAPPER = "optifine:launchwrapper-of:";
const MOJANG_LAUNCHWRAPPER_NAME = "net.minecraft:launchwrapper:";
const PLACED_MARKER = path.join("storage", "optifine.json");
const BUILDS_TTL_MS = 60 * 60 * 1000;
const PARTITION = "optifine-download";

export const MOJANG_LAUNCHWRAPPER: ManifestLibrary = {
  name: "net.minecraft:launchwrapper:1.12",
  downloads: {
    artifact: {
      path: "net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar",
      url: "https://libraries.minecraft.net/net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar",
      sha1: "111e7bea9c968cdb3d06ef4632bf7ff0824d0f36",
      size: 32999,
    },
  },
};

export interface OptiFineJarInfo {
  minecraft: string;
  edition: string;
  file: string;
  patches: boolean;
  launchwrapper: string | null;
}

function codedError(code: string, detail?: string): Error {
  return Object.assign(new Error(detail ? `${code}: ${detail}` : code), {
    code,
  });
}

export function optifineStoreDir(root: string = getDataRoot()): string {
  return path.join(root, "optifine");
}

export function optifineStorePath(file: string, root?: string): string {
  if (!isOptiFineFileName(file)) throw codedError(OPTIFINE_INVALID_FILE, file);
  return path.join(optifineStoreDir(root), file);
}

export async function inspectOptiFineJar(
  jarPath: string,
): Promise<OptiFineJarInfo | null> {
  try {
    return await withArchive(jarPath, async (archive) => {
      const config =
        archive.getEntry("net/optifine/Config.class") ??
        archive.getEntry("Config.class") ??
        archive.getEntry("VersionThread.class");
      if (!config || !archive.getEntry("optifine/OptiFineTweaker.class")) {
        return null;
      }

      const version = readOptiFineVersion(await readEntryData(config));
      if (!version) return null;

      const file = `OptiFine_${version.raw}_${version.edition}.jar`;
      if (!isOptiFineFileName(file)) return null;

      let launchwrapper: string | null = null;
      const marker = archive.getEntry("launchwrapper-of.txt");
      if (marker) {
        const value = (await readEntryData(marker)).toString("utf8").trim();
        if (
          /^[0-9.]+$/.test(value) &&
          archive.getEntry(`launchwrapper-of-${value}.jar`)
        ) {
          launchwrapper = value;
        }
      }

      return {
        minecraft: version.minecraft,
        edition: version.edition,
        file,
        patches: archive
          .getEntries()
          .some((entry) => entry.entryName.startsWith("patch/")),
        launchwrapper,
      };
    });
  } catch {
    return null;
  }
}

export async function storedOptiFine(
  choice: OptiFineChoice,
  root?: string,
): Promise<string | null> {
  if (!isOptiFineChoice(choice)) return null;
  const target = optifineStorePath(choice.file, root);
  return (await fs.pathExists(target)) ? target : null;
}

async function storeOptiFine(
  source: string,
  expectedMinecraft: string | undefined,
  root?: string,
): Promise<OptiFineChoice> {
  const info = await inspectOptiFineJar(source);
  if (!info) throw codedError(OPTIFINE_INVALID_FILE, path.basename(source));
  if (expectedMinecraft && info.minecraft !== expectedMinecraft) {
    throw codedError(OPTIFINE_WRONG_VERSION, info.minecraft);
  }

  const target = optifineStorePath(info.file, root);
  if (path.resolve(source) !== path.resolve(target)) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    await fs.ensureDir(path.dirname(target));
    try {
      await fs.copy(source, temporary);
      await fs.move(temporary, target, { overwrite: true });
    } finally {
      await fs.remove(temporary).catch(() => {});
    }
  }

  return { file: info.file, minecraft: info.minecraft, edition: info.edition };
}

export function importOptiFineFile(
  source: string,
  expectedMinecraft?: string,
): Promise<OptiFineChoice> {
  return storeOptiFine(source, expectedMinecraft);
}

let buildsCache: { at: number; builds: OptiFineBuild[] } | null = null;

export async function fetchOptiFineBuilds(force = false): Promise<OptiFineBuild[]> {
  if (!force && buildsCache && Date.now() - buildsCache.at < BUILDS_TTL_MS) {
    return buildsCache.builds;
  }

  let html: string;
  try {
    const response = await axios.get<string>(OPTIFINE_DOWNLOADS_URL, {
      timeout: 20000,
      responseType: "text",
      maxContentLength: 4 * 1024 * 1024,
    });
    html = String(response.data ?? "");
  } catch (error) {
    throw codedError(
      OPTIFINE_SITE_UNAVAILABLE,
      (error as Error)?.message ?? String(error),
    );
  }

  const builds = parseOptiFineDownloads(html);
  if (builds.length === 0) throw codedError(OPTIFINE_SITE_UNAVAILABLE, "empty");

  buildsCache = { at: Date.now(), builds };
  return builds;
}

export function isOptiFineSiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (host === OPTIFINE_HOST || host === `www.${OPTIFINE_HOST}`)
    );
  } catch {
    return false;
  }
}

export function downloadedOptiFineFile(url: string): string | null {
  if (!isOptiFineSiteUrl(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== "/downloadx") return null;
    const file = parsed.searchParams.get("f") ?? "";
    return isOptiFineFileName(file) ? file : null;
  } catch {
    return null;
  }
}

let activeDownload: {
  file: string;
  window: BrowserWindow;
  promise: Promise<OptiFineChoice | null>;
} | null = null;

let partitionReady = false;

function downloadSession() {
  const target = session.fromPartition(PARTITION);
  if (!partitionReady) {
    partitionReady = true;
    target.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    target.setPermissionCheckHandler(() => false);
    target.setDevicePermissionHandler(() => false);
  }
  return target;
}

export function closeOptiFineDownload(): void {
  const current = activeDownload;
  if (current && !current.window.isDestroyed()) current.window.close();
}

export function downloadOptiFine(
  choice: OptiFineChoice,
): Promise<OptiFineChoice | null> {
  if (!isOptiFineChoice(choice)) {
    return Promise.reject(codedError(OPTIFINE_INVALID_FILE));
  }

  if (activeDownload && !activeDownload.window.isDestroyed()) {
    if (activeDownload.file === choice.file) {
      activeDownload.window.focus();
      return activeDownload.promise;
    }
    activeDownload.window.close();
  }

  const ses = downloadSession();
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    show: false,
    parent,
    title: "OptiFine — optifine.net",
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      devTools: false,
    },
  });
  window.removeMenu();

  const promise = new Promise<OptiFineChoice | null>((resolve) => {
    let settled = false;
    let storing = false;

    const finish = (result: OptiFineChoice | null) => {
      if (settled) return;
      settled = true;
      ses.removeListener("will-download", onDownload);
      if (activeDownload?.window === window) activeDownload = null;
      resolve(result);
      if (!window.isDestroyed()) window.close();
    };

    const onDownload = (
      event: Electron.Event,
      item: ElectronDownload,
      contents: Electron.WebContents,
    ) => {
      if (window.isDestroyed() || contents !== window.webContents) return;

      const file = downloadedOptiFineFile(item.getURL());
      const parsed = file ? parseOptiFineFile(file) : null;
      if (!file || !parsed || parsed.minecraft !== choice.minecraft || storing) {
        event.preventDefault();
        return;
      }

      storing = true;
      const temporary = path.join(
        optifineStoreDir(),
        `.download-${randomUUID()}.jar`,
      );
      fs.ensureDirSync(path.dirname(temporary));
      item.setSavePath(temporary);
      item.once("done", (_doneEvent, state) => {
        void (async () => {
          try {
            if (state !== "completed") {
              storing = false;
              return;
            }
            finish(await storeOptiFine(temporary, choice.minecraft));
          } catch (error) {
            console.error("[optifine] downloaded file was rejected:", error);
            storing = false;
          } finally {
            await fs.remove(temporary).catch(() => {});
          }
        })();
      });
    };

    ses.on("will-download", onDownload);
    window.on("closed", () => finish(null));
  });

  const guard = (event: Electron.Event, url: string) => {
    if (!isOptiFineSiteUrl(url)) event.preventDefault();
  };
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", guard);
  window.webContents.on("will-redirect", guard);
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });

  activeDownload = { file: choice.file, window, promise };
  void window.loadURL(optifineAdPageUrl(choice.file)).catch((error) => {
    console.warn("[optifine] the official download page did not load:", error);
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  });

  return promise;
}

export function findDirectDownloadLink(html: string, file: string): string | null {
  for (const match of html.matchAll(/href=['"](downloadx\?[^'"]+)['"]/g)) {
    const url = `${OPTIFINE_SITE}/${match[1].replace(/&amp;/g, "&")}`;
    if (downloadedOptiFineFile(url) === file) return url;
  }
  return null;
}

async function fetchOptiFineDirect(
  choice: OptiFineChoice,
): Promise<OptiFineChoice | null> {
  const pageUrl = optifineAdPageUrl(choice.file);
  const page = await axios.get<string>(pageUrl, {
    timeout: 20000,
    responseType: "text",
    maxContentLength: 1024 * 1024,
  });
  const link = findDirectDownloadLink(String(page.data ?? ""), choice.file);
  if (!link) return null;

  const response = await axios.get<ArrayBuffer>(link, {
    timeout: 120000,
    responseType: "arraybuffer",
    maxContentLength: 64 * 1024 * 1024,
    headers: { Referer: pageUrl },
  });

  const temporary = path.join(optifineStoreDir(), `.direct-${randomUUID()}.jar`);
  await fs.ensureDir(path.dirname(temporary));
  try {
    await fs.writeFile(temporary, Buffer.from(response.data));
    return await storeOptiFine(temporary, choice.minecraft);
  } finally {
    await fs.remove(temporary).catch(() => {});
  }
}

export async function obtainOptiFine(
  choice: OptiFineChoice,
): Promise<OptiFineChoice | null> {
  if (await storedOptiFine(choice)) return choice;

  try {
    const direct = await fetchOptiFineDirect(choice);
    if (direct) return direct;
  } catch (error) {
    console.warn("[optifine] direct download from optifine.net failed:", error);
  }

  return downloadOptiFine(choice);
}

export function optifineLibraryPath(choice: OptiFineChoice): string {
  const version = optifineLibraryVersion(choice);
  return `optifine/OptiFine/${version}/OptiFine-${version}.jar`;
}

function launchwrapperLibrary(version: string): ManifestLibrary {
  return {
    name: `${OPTIFINE_LAUNCHWRAPPER}${version}`,
    downloads: {
      artifact: {
        path: `optifine/launchwrapper-of/${version}/launchwrapper-of-${version}.jar`,
        url: "",
        sha1: "",
        size: 0,
      },
    },
  };
}

function isOptiFineLibraryName(name: string | undefined): boolean {
  return (
    !!name &&
    (name.startsWith(OPTIFINE_LIBRARY) || name.startsWith(OPTIFINE_LAUNCHWRAPPER))
  );
}

export function hasOptiFineLayer(
  manifest: Pick<IVersionManifest, "libraries">,
  choice?: OptiFineChoice,
): boolean {
  const libraries = manifest.libraries ?? [];
  if (!choice) {
    return libraries.some((library) =>
      library.name?.startsWith(OPTIFINE_LIBRARY),
    );
  }
  const name = `${OPTIFINE_LIBRARY}${optifineLibraryVersion(choice)}`;
  return libraries.some((library) => library.name === name);
}

export function vanillaOptiFine(conf: IVersionConf): OptiFineChoice | null {
  if (conf.loader.name !== "vanilla") return null;
  return activeOptiFine(conf);
}

export function activeOptiFine(conf: IVersionConf): OptiFineChoice | null {
  const choice = conf.optifine;
  if (!choice || !isOptiFineChoice(choice)) return null;
  if (choice.minecraft !== conf.version.id) return null;
  return optifineOffer(conf.version.id, conf.loader.name) === "optifine"
    ? choice
    : null;
}

export function optifineLayerMatches(
  manifest: Pick<IVersionManifest, "libraries">,
  conf: IVersionConf,
): boolean {
  if (conf.loader.name !== "vanilla") return true;
  const wanted = vanillaOptiFine(conf);
  return wanted ? hasOptiFineLayer(manifest, wanted) : !hasOptiFineLayer(manifest);
}

export function applyOptiFineLayer(
  manifest: IVersionManifest,
  choice: OptiFineChoice,
  launchwrapper: string | null,
): IVersionManifest {
  const wrapper = launchwrapper
    ? launchwrapperLibrary(launchwrapper)
    : MOJANG_LAUNCHWRAPPER;
  const optifine: ManifestLibrary = {
    name: `${OPTIFINE_LIBRARY}${optifineLibraryVersion(choice)}`,
    downloads: {
      artifact: {
        path: optifineLibraryPath(choice),
        url: "",
        sha1: "",
        size: 0,
      },
    },
  };

  manifest.libraries = [
    wrapper,
    optifine,
    ...(manifest.libraries ?? []).filter(
      (library) =>
        !isOptiFineLibraryName(library.name) &&
        !library.name?.startsWith(MOJANG_LAUNCHWRAPPER_NAME),
    ),
  ];

  if (!manifest.mainClass?.startsWith(LAUNCHWRAPPER_PREFIX)) {
    manifest.mainClass = LAUNCHWRAPPER_MAIN;
  }

  if (manifest.minecraftArguments !== undefined) {
    if (!manifest.minecraftArguments.includes(OPTIFINE_TWEAKER)) {
      manifest.minecraftArguments =
        `${manifest.minecraftArguments} --tweakClass ${OPTIFINE_TWEAKER}`.trim();
    }
  } else {
    manifest.arguments = manifest.arguments ?? { game: [], jvm: [] };
    if (!manifest.arguments.game.includes(OPTIFINE_TWEAKER)) {
      manifest.arguments.game.push("--tweakClass", OPTIFINE_TWEAKER);
    }
  }

  return manifest;
}

const VANILLA_MAIN = "net.minecraft.client.main.Main";

export function stripOptiFineLayer(manifest: IVersionManifest): IVersionManifest {
  if (!hasOptiFineLayer(manifest)) return manifest;

  manifest.libraries = (manifest.libraries ?? []).filter(
    (library) =>
      !isOptiFineLibraryName(library.name) &&
      library.name !== MOJANG_LAUNCHWRAPPER.name,
  );

  if (manifest.minecraftArguments !== undefined) {
    manifest.minecraftArguments = manifest.minecraftArguments
      .replace(` --tweakClass ${OPTIFINE_TWEAKER}`, "")
      .replace(`--tweakClass ${OPTIFINE_TWEAKER}`, "")
      .trim();
  }

  const game = manifest.arguments?.game;
  if (game) {
    const index = game.findIndex(
      (arg, position) =>
        arg === "--tweakClass" && game[position + 1] === OPTIFINE_TWEAKER,
    );
    if (index >= 0) game.splice(index, 2);
  }

  const tweaks = [
    manifest.minecraftArguments ?? "",
    ...(game ?? []).filter((arg): arg is string => typeof arg === "string"),
  ].join(" ");
  if (manifest.mainClass === LAUNCHWRAPPER_MAIN && !tweaks.includes("--tweakClass")) {
    manifest.mainClass = VANILLA_MAIN;
  }

  return manifest;
}

async function readPlaced(versionPath: string): Promise<string | null> {
  const data = await fs
    .readJSON(path.join(versionPath, PLACED_MARKER))
    .catch(() => null);
  const file = typeof data?.file === "string" ? data.file : "";
  return isOptiFineFileName(file) ? file : null;
}

export async function placedOptiFineMod(
  versionPath: string,
): Promise<string | null> {
  return readPlaced(versionPath);
}

async function removePlacedMod(versionPath: string, keep: string | null) {
  const placed = await readPlaced(versionPath);
  if (!placed || placed === keep) return;

  const modsPath = path.join(versionPath, "mods");
  await fs.remove(path.join(modsPath, placed)).catch(() => {});
  await fs.remove(path.join(modsPath, `${placed}.disabled`)).catch(() => {});
  await fs.remove(path.join(versionPath, PLACED_MARKER)).catch(() => {});
}

export function forgeOptiFine(conf: IVersionConf): OptiFineChoice | null {
  if (conf.loader.name !== "forge") return null;
  return activeOptiFine(conf);
}

export interface MaterializeOptions {
  conf: IVersionConf;
  versionPath: string;
  launchVersionPath: string;
  librariesPath: string;
  javaPath: string;
  manifest?: Pick<IVersionManifest, "libraries">;
  signal?: AbortSignal;
  onStep?: (step: "patching" | "copying") => void;
}

export async function requireStoredOptiFine(
  choice: OptiFineChoice,
): Promise<{ source: string; info: OptiFineJarInfo }> {
  const source = await storedOptiFine(choice);
  if (!source) throw codedError(OPTIFINE_FILE_MISSING, choice.file);
  const info = await inspectOptiFineJar(source);
  if (!info || info.file !== choice.file) {
    throw codedError(OPTIFINE_INVALID_FILE, choice.file);
  }
  return { source, info };
}

async function patchClientJar(
  options: MaterializeOptions,
  source: string,
  target: string,
) {
  const workDir = path.join(options.launchVersionPath, "temp-optifine");
  const output = path.join(workDir, `${randomUUID()}.jar`);
  await fs.remove(workDir).catch(() => {});
  await fs.ensureDir(workDir);

  try {
    const base = path.join(
      options.launchVersionPath,
      `${options.conf.version.id}.jar`,
    );
    const lines: string[] = [];
    const code = await runJar(
      options.javaPath,
      ["-cp", source, "optifine.Patcher", base, source, output],
      workDir,
      {
        signal: options.signal,
        onOutput: ({ message }) => {
          lines.push(message);
          if (lines.length > 40) lines.shift();
        },
      },
    );

    if (code !== 0 || !(await fs.pathExists(output))) {
      throw codedError(
        OPTIFINE_PATCH_FAILED,
        `exit ${String(code)}: ${lines.join("").slice(-800)}`,
      );
    }

    await fs.ensureDir(path.dirname(target));
    await fs.move(output, target, { overwrite: true });
  } finally {
    await fs.remove(workDir).catch(() => {});
  }
}

async function extractLaunchwrapper(
  source: string,
  version: string,
  target: string,
) {
  const data = await withArchive(source, async (archive) => {
    const entry = archive.getEntry(`launchwrapper-of-${version}.jar`);
    return entry ? readEntryData(entry) : null;
  });
  if (!data) throw codedError(OPTIFINE_INVALID_FILE, "launchwrapper");

  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.ensureDir(path.dirname(target));
  try {
    await fs.writeFile(temporary, data);
    await fs.move(temporary, target, { overwrite: true });
  } finally {
    await fs.remove(temporary).catch(() => {});
  }
}

export async function materializeOptiFine(
  options: MaterializeOptions,
): Promise<void> {
  const { conf, versionPath } = options;
  const forge = forgeOptiFine(conf);
  await removePlacedMod(versionPath, forge?.file ?? null);

  if (forge) {
    const target = path.join(versionPath, "mods", forge.file);
    if (
      !(await fs.pathExists(target)) &&
      !(await fs.pathExists(`${target}.disabled`))
    ) {
      const { source } = await requireStoredOptiFine(forge);
      options.onStep?.("copying");
      await fs.ensureDir(path.dirname(target));
      await fs.copy(source, target);
    }
    await fs.outputJSON(path.join(versionPath, PLACED_MARKER), {
      file: forge.file,
    });
    return;
  }

  const vanilla = vanillaOptiFine(conf);
  if (!vanilla) return;

  const library = path.join(options.librariesPath, optifineLibraryPath(vanilla));
  const wrappers = (options.manifest?.libraries ?? [])
    .filter((entry) => entry.name?.startsWith(OPTIFINE_LAUNCHWRAPPER))
    .map((entry) => path.join(options.librariesPath, entry.downloads.artifact.path));
  const present = await Promise.all(
    [library, ...wrappers].map((file) => fs.pathExists(file)),
  );
  if (options.manifest && present.every(Boolean)) return;

  const { source, info } = await requireStoredOptiFine(vanilla);
  if (!(await fs.pathExists(library))) {
    if (info.patches) {
      options.onStep?.("patching");
      await patchClientJar(options, source, library);
    } else {
      options.onStep?.("copying");
      await fs.ensureDir(path.dirname(library));
      await fs.copy(source, library);
    }
  }

  if (info.launchwrapper) {
    const wrapper = path.join(
      options.librariesPath,
      launchwrapperLibrary(info.launchwrapper).downloads.artifact.path,
    );
    if (!(await fs.pathExists(wrapper))) {
      await extractLaunchwrapper(source, info.launchwrapper, wrapper);
    }
  }
}
