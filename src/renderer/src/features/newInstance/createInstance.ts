import axios from "axios";
import { getDefaultStore } from "jotai";
import type { IArguments } from "@/types/IArguments";
import type { Loader } from "@/types/Loader";
import type { IVersion, IVersionConf } from "@/types/IVersion";
import type { ILocalProject, IModpackExtraFile } from "@/types/ModManager";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import type { IServer } from "@/types/ServersList";
import type { LoaderVersion } from "@/types/VersionsService";
import { Mods } from "@renderer/classes/Mods";
import { Version } from "@renderer/classes/Version";
import {
  accountAtom,
  networkAtom,
  pathsAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import {
  applyBlockedModFilePaths,
  type IBlockedMod,
} from "@renderer/utilities/blockedMods";
import {
  getLocalPathFromFileUrl,
  toFileUrl,
} from "@renderer/utilities/exportVersion";
import { sanitizeExtraFileSegments } from "@renderer/utilities/versionPure";
import { parseInlineImage } from "./inlineImage";
import type { AppliedPack } from "./state";

const api = window.api;

const LOGO_DOWNLOAD_TIMEOUT_MS = 20000;

export const INSTANCE_FOLDER_EXISTS = "INSTANCE_FOLDER_EXISTS";
export const INSTANCE_CONTENT_FAILED = "INSTANCE_CONTENT_FAILED";

export interface CreateInstanceResult {
  instance: Version;
  extraFilesFailed: boolean;
}

export interface CreateInstanceRequest {
  name: string;
  image: string;
  loader: Loader;
  loaderVersion?: LoaderVersion;
  minecraftVersion: IVersion;
  mods: ILocalProject[];
  servers: IServer[];
  options: string;
  runArguments: IArguments;
  quickServer: string;
  pack: AppliedPack | null;
  blockedMods: IBlockedMod[];
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(VERSION_INSTALL_CANCELLED);
}

function assertWritten(done: boolean): void {
  if (!done) throw new Error(INSTANCE_CONTENT_FAILED);
}

function imageExtension(source: string, contentType?: string): string {
  const declared = contentType?.split(";")[0]?.trim().toLowerCase();
  if (declared === "image/jpeg") return "jpg";
  if (declared === "image/png") return "png";
  if (declared === "image/webp") return "webp";

  try {
    const pathname = source.startsWith("file://")
      ? new URL(source).pathname
      : source.split("?")[0];
    const extension = decodeURIComponent(pathname)
      .split("/")
      .pop()
      ?.split(".")
      .pop()
      ?.toLowerCase();

    if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {}

  return "png";
}

async function persistImage(
  image: string,
  versionPath: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!image) return "";

  const inline = parseInlineImage(image);
  if (inline) {
    try {
      const target = await api.path.join(
        versionPath,
        `logo.${inline.extension}`,
      );
      await api.fs.writeFile(target, inline.base64, "base64");
      return toFileUrl(target);
    } catch {
      return "";
    }
  }

  try {
    if (image.startsWith("file://")) {
      const source = getLocalPathFromFileUrl(image);
      const target = await api.path.join(
        versionPath,
        `logo.${imageExtension(image)}`,
      );
      await api.fs.copy(source, target);
      return toFileUrl(target);
    }

    const response = await axios.get(image, {
      responseType: "arraybuffer",
      timeout: LOGO_DOWNLOAD_TIMEOUT_MS,
      signal,
    });
    const header = response.headers["content-type"];
    const target = await api.path.join(
      versionPath,
      `logo.${imageExtension(image, typeof header === "string" ? header : undefined)}`,
    );
    await api.fs.writeFile(
      target,
      api.file.fromBuffer(response.data),
      "binary",
    );

    return toFileUrl(target);
  } catch {
    return image;
  }
}

function rewriteImportedLocalPaths(
  mods: ILocalProject[],
  importRoot: string,
  versionPath: string,
): void {
  const normalizedRoot = importRoot.replace(/\\/g, "/");
  const overrideRoots = [
    `${normalizedRoot}/overrides`,
    `${normalizedRoot}/client-overrides`,
  ];
  const normalizedTarget = versionPath.replace(/\\/g, "/");

  for (const mod of mods) {
    for (const file of mod.version?.files ?? []) {
      if (!file.localPath) continue;

      const normalized = file.localPath.replace(/\\/g, "/");
      const matched = overrideRoots.find((root) => normalized.startsWith(root));
      if (!matched) continue;

      const relative = normalized.slice(matched.length).replace(/^\/+/, "");
      if (!relative) continue;

      file.localPath = `${normalizedTarget}/${relative}`;
    }
  }
}

async function downloadExtraFiles(
  extraFiles: IModpackExtraFile[],
  versionPath: string,
  downloadLimit: number,
): Promise<boolean> {
  const downloads: { url: string; destination: string; group: string }[] = [];

  for (const extra of extraFiles) {
    const segments = sanitizeExtraFileSegments(extra.path);
    if (!segments) continue;

    if (extra.isClient) {
      downloads.push({
        url: extra.url,
        destination: await api.path.join(versionPath, ...segments),
        group: "other",
      });
    }

    if (extra.isServer) {
      downloads.push({
        url: extra.url,
        destination: await api.path.join(
          versionPath,
          "storage",
          "server-overrides",
          ...segments,
        ),
        group: "other",
      });
    }
  }

  if (downloads.length === 0) return true;

  return (await api.file.download(downloads, downloadLimit)) !== false;
}

async function copyImportedFolders(
  importRoot: string,
  versionPath: string,
): Promise<void> {
  for (const folder of ["overrides", "client-overrides"]) {
    const source = await api.path.join(importRoot, folder);
    if (await api.fs.pathExists(source)) {
      assertWritten(await api.fs.copy(source, versionPath));
    }
  }

  const serverOverrides = await api.path.join(importRoot, "server-overrides");
  if (await api.fs.pathExists(serverOverrides)) {
    assertWritten(
      await api.fs.copy(
        serverOverrides,
        await api.path.join(versionPath, "storage", "server-overrides"),
      ),
    );
  }
}

export async function createInstance(
  request: CreateInstanceRequest,
): Promise<CreateInstanceResult> {
  const store = getDefaultStore();
  const account = store.get(accountAtom);
  const settings = store.get(settingsAtom);
  const paths = store.get(pathsAtom);

  if (!account) throw new Error("no account");

  const name = request.name.trim();
  const versionPath = await api.path.join(paths.minecraft, "versions", name);
  const pack = request.pack;
  const importData = pack?.importData;
  const importModpack = pack?.importModpack;
  const skipContentDownload = !!importData;
  const signal = request.signal;

  throwIfAborted(signal);

  if (await api.fs.pathExists(versionPath)) {
    throw new Error(INSTANCE_FOLDER_EXISTS);
  }

  assertWritten(await api.fs.ensure(versionPath));

  let instance: Version | undefined;
  let extraFilesFailed = false;

  try {
    throwIfAborted(signal);
    const image = await persistImage(request.image, versionPath, signal);
    const base: Partial<IVersionConf> = pack?.shareVersion
      ? { ...pack.shareVersion }
      : importData
        ? { ...importData.conf }
        : {};

    const existing = store.get(versionsAtom);
    const isDownloadedVersion = pack?.shareVersion
      ? pack.isOwner
        ? existing.some(
            (item) => item.version.shareCode === pack.shareVersion?.shareCode,
          )
        : true
      : false;

    const conf: IVersionConf = {
      ...base,
      name,
      version: { ...request.minecraftVersion },
      lastLaunch: undefined,
      lastUpdate: new Date(),
      downloadedVersion: isDownloadedVersion,
      shareCode: pack?.shareCode,
      build: pack?.shareVersion?.build ?? base.build ?? 0,
      runArguments: request.runArguments,
      quickServer: request.quickServer || undefined,
      image,
      loader: {
        name: request.loader,
        mods: request.mods,
        version: request.loaderVersion,
        other: base.loader?.other || undefined,
      },
      owner: `${account.type}_${account.nickname}`,
    };

    if (!importData) {
      if (request.servers.length > 0) {
        assertWritten(
          await api.servers.write(
            request.servers,
            await api.path.join(versionPath, "servers.dat"),
          ),
        );
      }

      if (request.options) {
        assertWritten(
          await api.fs.writeFile(
            await api.path.join(versionPath, "options.txt"),
            request.options,
            "utf-8",
          ),
        );
      }
    }

    if (importData) {
      assertWritten(await api.fs.copy(importData.path, versionPath));
    } else if (importModpack) {
      await copyImportedFolders(importModpack.folderPath, versionPath);
      extraFilesFailed = !(await downloadExtraFiles(
        importModpack.extraFiles ?? [],
        versionPath,
        settings.downloadLimit,
      ));
      rewriteImportedLocalPaths(
        request.mods,
        importModpack.folderPath,
        versionPath,
      );
    }

    throwIfAborted(signal);

    instance = new Version(conf);
    await instance.init();

    await instance.install(
      account,
      settings,
      [],
      {
        cleanupOnCancel: true,
        keepProgressOpen: !skipContentDownload,
      },
      signal,
    );

    throwIfAborted(signal);

    assertWritten(await instance.save());

    if (!skipContentDownload) {
      const hasBlockedPaths = applyBlockedModFilePaths(
        request.mods,
        request.blockedMods,
      );
      if (hasBlockedPaths) instance.version.loader.mods = request.mods;

      const content = new Mods(settings, conf);
      await content.check({
        operation: "install",
        keepProgressOpen: !!conf.loader.other?.url,
      });

      if (conf.loader.other?.url) {
        await content.downloadOther({ operation: "install" });
      }

      if (hasBlockedPaths) assertWritten(await instance.save());
    }

    throwIfAborted(signal);

    if (pack?.shareCode && isDownloadedVersion && store.get(networkAtom)) {
      await api.backend
        .modpackDownloaded(account.accessToken || "", pack.shareCode)
        .catch(() => undefined);
    }

    const importRoot = importData?.path ?? importModpack?.folderPath;
    if (importRoot) await api.fs.rimraf(importRoot).catch(() => undefined);

    store.set(versionsAtom, [...store.get(versionsAtom), instance]);

    return { instance, extraFilesFailed };
  } catch (error) {
    if (instance) {
      await instance.delete(account, false).catch(() => undefined);
    } else {
      await api.fs.rimraf(versionPath).catch(() => undefined);
    }

    throw error;
  }
}
