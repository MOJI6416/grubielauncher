import axios from "axios";
import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import { IVersionConf } from "@/types/IVersion";
import { IVersionManifest } from "@/types/IVersionManifest";
import { LARGE_ARCHIVE_LIMITS, readZipEntries } from "./archiver";
import {
  deobfuscateIntermediary,
  deobfuscateOfficial,
  hasObfuscatedNames,
  mappingNamespace,
} from "./crashDeobfuscation";
import { resolveDownloadCandidates } from "./mirrors";
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled,
} from "./mirrorState";
import { getLauncherPaths } from "./other";

export const MAPPINGS_BUDGET_MS = 8000;
const DOWNLOAD_TIMEOUT_MS = 30000;
const MAX_MAPPINGS_BYTES = 64 * 1024 * 1024;
const MOJANG_HOST = /^https:\/\/(?:piston-meta|piston-data|launcher)\.mojang\.com\//;
const SAFE_VERSION = /^[\w.+-]{1,64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const INTERMEDIARY_ENTRY = "mappings/mappings.tiny";

export interface CrashMappingPaths {
  versionPath: string;
  librariesPath: string;
  cachePath: string;
}

const pendingDownloads = new Map<string, Promise<string | null>>();

export function readableCrashText(versionPath: string, text: string): Promise<string> {
  const paths = getLauncherPaths();
  return deobfuscateCrashText(text, {
    versionPath,
    librariesPath: path.join(paths.minecraft, "libraries"),
    cachePath: path.join(paths.cache, "mappings"),
  });
}

export async function deobfuscateCrashText(
  text: string,
  paths: CrashMappingPaths,
  budgetMs: number = MAPPINGS_BUDGET_MS,
): Promise<string> {
  if (!text) return text;

  try {
    const conf = (await fs
      .readJSON(path.join(paths.versionPath, "version.json"))
      .catch(() => null)) as IVersionConf | null;
    const mcVersion = conf?.version?.id;
    const namespace = mappingNamespace(conf?.loader?.name);
    if (!mcVersion || !SAFE_VERSION.test(mcVersion) || !namespace) return text;
    if (!hasObfuscatedNames(text, namespace)) return text;

    const proguard = await withinBudget(
      clientMappings(paths, mcVersion),
      budgetMs,
    );
    if (!proguard) return text;
    if (namespace === "official") return deobfuscateOfficial(text, proguard);

    const tiny = await intermediaryMappings(paths.librariesPath, mcVersion);
    return tiny ? deobfuscateIntermediary(text, tiny, proguard) : text;
  } catch {
    return text;
  }
}

function withinBudget<T>(work: Promise<T | null>, budgetMs: number): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs);
  });

  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function clientMappings(
  paths: CrashMappingPaths,
  mcVersion: string,
): Promise<string | null> {
  const manifest = (await fs
    .readJSON(path.join(paths.versionPath, `${mcVersion}.json`))
    .catch(() => null)) as Partial<IVersionManifest> | null;
  const download = manifest?.downloads?.client_mappings;
  const sha1 = download?.sha1?.toLowerCase();
  if (!download?.url || !sha1 || !SHA1.test(sha1) || !MOJANG_HOST.test(download.url)) {
    return null;
  }

  const file = path.join(paths.cachePath, `${sha1}.txt`);
  const cached = await fs.readFile(file, "utf-8").catch(() => null);
  if (cached) return cached;

  const pending = pendingDownloads.get(sha1);
  if (pending) return pending;

  const work = downloadMappings(download.url, sha1, file)
    .catch(() => null)
    .finally(() => pendingDownloads.delete(sha1));
  pendingDownloads.set(sha1, work);
  return work;
}

async function downloadMappings(
  url: string,
  sha1: string,
  file: string,
): Promise<string | null> {
  const candidates = resolveDownloadCandidates(
    url,
    getDownloadSource(),
    getMojangReachable(),
    isMirrorDisabled(),
  );

  for (const candidate of candidates) {
    try {
      const response = await axios.get<ArrayBuffer>(candidate, {
        responseType: "arraybuffer",
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxContentLength: MAX_MAPPINGS_BYTES,
      });
      const body = Buffer.from(response.data);
      if (createHash("sha1").update(body).digest("hex") !== sha1) continue;

      await fs.ensureDir(path.dirname(file));
      const partial = `${file}.${process.pid}.part`;
      await fs.writeFile(partial, body);
      await fs.move(partial, file, { overwrite: true });
      return body.toString("utf-8");
    } catch {
      continue;
    }
  }

  return null;
}

async function intermediaryMappings(
  librariesPath: string,
  mcVersion: string,
): Promise<string | null> {
  const jar = path.join(
    librariesPath,
    "net",
    "fabricmc",
    "intermediary",
    mcVersion,
    `intermediary-${mcVersion}.jar`,
  );
  if (!(await fs.pathExists(jar))) return null;

  const entries = await readZipEntries(
    jar,
    new Set([INTERMEDIARY_ENTRY]),
    LARGE_ARCHIVE_LIMITS,
  );
  return entries.get(INTERMEDIARY_ENTRY)?.toString("utf-8") ?? null;
}
