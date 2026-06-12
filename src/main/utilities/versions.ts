import { checkModpack } from "./modManager";
import { readNBT } from "./nbt";
import type { IImportModpack, IVersionConf } from "@/types/IVersion";
import path from "path";
import fs from "fs-extra";
import { rimraf } from "rimraf";
import { extractZip } from "./archiver";
import { pathToFileURL } from "url";

function findImportedLogoPath(versionPath: string) {
  for (const filename of ["logo.png", "logo.jpg", "logo.jpeg", "logo.webp"]) {
    const logoPath = path.join(versionPath, filename);
    if (fs.existsSync(logoPath)) return logoPath;
  }

  return "";
}

export function sanitizeImportedVersionConf(
  conf: IVersionConf,
  versionPath: string,
): IVersionConf {
  const logoPath = findImportedLogoPath(versionPath);

  conf.owner = undefined;
  conf.shareCode = undefined;
  conf.downloadedVersion = false;

  for (const mod of conf.loader?.mods ?? []) {
    for (const file of mod.version?.files ?? []) {
      delete file.localPath;
      if (file.url?.startsWith("file://")) file.url = "";
    }
  }

  if (typeof conf.image === "string" && conf.image.startsWith("file://")) {
    conf.image = logoPath ? pathToFileURL(logoPath).href : "";
  }

  return conf;
}

function isGrubieVersionConf(value: unknown): value is IVersionConf {
  if (!value || typeof value !== "object") return false;

  const conf = value as Partial<IVersionConf>;
  const versionOk =
    typeof (conf.version as unknown) === "string"
      ? (conf.version as unknown as string).length > 0
      : !!conf.version &&
        typeof conf.version === "object" &&
        typeof conf.version.id === "string";

  return (
    typeof conf.name === "string" &&
    versionOk &&
    !!conf.loader &&
    typeof conf.loader === "object" &&
    typeof conf.loader.name === "string" &&
    Array.isArray(conf.loader.mods)
  );
}

function normalizeLegacyVersionField(conf: IVersionConf): IVersionConf {
  if (typeof (conf.version as unknown) === "string") {
    conf.version = {
      id: conf.version as unknown as string,
      type: "release",
      url: "",
      serverManager: false,
    } as IVersionConf["version"];
  }

  return conf;
}

async function resolveGrubieConfRoot(
  versionPath: string,
): Promise<{ root: string; conf: IVersionConf } | null> {
  const rootConfPath = path.join(versionPath, "version.json");
  if (await fs.pathExists(rootConfPath)) {
    const conf = await fs.readJSON(rootConfPath, "utf-8").catch(() => null);
    if (isGrubieVersionConf(conf)) return { root: versionPath, conf };
  }

  const entries = await fs.readdir(versionPath).catch(() => []);
  for (const entry of entries) {
    const childRoot = path.join(versionPath, entry);
    const childConfPath = path.join(childRoot, "version.json");
    if (!(await fs.pathExists(childConfPath))) continue;

    const conf = await fs.readJSON(childConfPath, "utf-8").catch(() => null);
    if (isGrubieVersionConf(conf)) return { root: childRoot, conf };
  }

  return null;
}

export async function importVersion(
  filePath: string,
  tempPath: string,
): Promise<IImportModpack> {
  const versionName = path.basename(filePath, path.extname(filePath));
  if (!versionName) {
    throw Error("invalid file name");
  }

  await fs.ensureDir(tempPath);

  const versionPath = path.join(tempPath, versionName);

  if (await fs.pathExists(versionPath)) {
    await rimraf(versionPath).catch(() => {});
  }

  try {
    await extractZip(filePath, versionPath);

    const grubieConf = await resolveGrubieConfRoot(versionPath);

    if (!grubieConf) {
      const modpack = await checkModpack(versionPath);

      if (!modpack) {
        await rimraf(versionPath).catch(() => {});
        throw Error("not modpack");
      }

      return {
        type: "other",
        other: modpack,
      };
    }

    const effectiveRoot = grubieConf.root;
    const conf = sanitizeImportedVersionConf(
      normalizeLegacyVersionField(grubieConf.conf),
      effectiveRoot,
    );

    const servers = await readNBT(path.join(effectiveRoot, "servers.dat"));

    const optionsPath = path.join(effectiveRoot, "options.txt");
    let options = "";

    if (await fs.pathExists(optionsPath))
      options = await fs.readFile(optionsPath, "utf-8");

    return {
      type: "gl",
      gl: {
        path: effectiveRoot,
        conf,
        servers,
        options,
      },
    };
  } catch (err) {
    if (await fs.pathExists(versionPath)) {
      await rimraf(versionPath).catch(() => {});
    }
    throw err;
  }
}
