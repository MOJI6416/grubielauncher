import os from "os";
import path from "path";
import fs from "fs-extra";
import type { IAssetIndex } from "@/types/IAssetIndex";
import type { DownloadItem } from "@/types/Downloader";
import {
  buildLaunchAliasName,
  hasNonAsciiPath,
  normalizeLinkTarget,
} from "./launchAlias";

const FML_LIBS_URL = "https://files.prismlauncher.org/fmllibs";
const FML_DEOBFUSCATION_DATA: Record<string, { sha1: string; size: number }> = {
  "1.5": { sha1: "5f7c142d53776f16304c0bbe10542014abad6af8", size: 200547 },
  "1.5.1": { sha1: "22e221a0d89516c1f721d6cab056a7e37471d0a6", size: 200886 },
  "1.5.2": { sha1: "446e55cd986582c70fcf12cb27bc00114c5adfd9", size: 201404 },
};

export function usesUppercaseLangCode(mcVersion: string): boolean {
  if (/^(?:rd-|inf-|c0\.|a1\.|b1\.)/i.test(mcVersion)) return true;

  const snapshot = /^(\d{2})w(\d{2})/.exec(mcVersion);
  if (snapshot) {
    const year = Number(snapshot[1]);
    return year < 16 || (year === 16 && Number(snapshot[2]) < 32);
  }

  const release = /^1\.(\d+)/.exec(mcVersion);
  return !!release && Number(release[1]) <= 10;
}

export function legacyAssetsDir(
  index: Pick<IAssetIndex, "virtual" | "map_to_resources">,
  options: { minecraftPath: string; indexId: string; gameDir: string },
): string | null {
  if (index.map_to_resources) return path.join(options.gameDir, "resources");
  if (index.virtual)
    return path.join(
      options.minecraftPath,
      "assets",
      "virtual",
      options.indexId,
    );
  return null;
}

export function usesLegacyWorkDir(minecraftArguments?: string): boolean {
  return !!minecraftArguments?.trimStart().startsWith("${auth_player_name}");
}

export function legacyHomeBase(
  dataRoot: string,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir(),
): string {
  if (platform === "win32" && homeDir && !hasNonAsciiPath(homeDir)) {
    return path.join(homeDir, ".grubie-legacy-home");
  }
  return path.join(dataRoot, "launch", "legacy-home");
}

function defaultDirLink(home: string, platform: NodeJS.Platform): string {
  return platform === "darwin"
    ? path.join(home, "Library", "Application Support", "minecraft")
    : path.join(home, ".minecraft");
}

async function pruneLegacyHomes(base: string, platform: NodeJS.Platform) {
  const names = await fs.readdir(base).catch(() => [] as string[]);
  for (const name of names) {
    const home = path.join(base, name);
    const link = defaultDirLink(home, platform);
    const stat = await fs.lstat(link).catch(() => null);
    if (!stat?.isSymbolicLink()) continue;
    const target = await fs.readlink(link).catch(() => null);
    if (target === null || (await fs.pathExists(normalizeLinkTarget(target))))
      continue;
    await fs.unlink(link).catch(() => {});
    let dir = path.dirname(link);
    while (dir.startsWith(home)) {
      if (
        !(await fs.rmdir(dir).then(
          () => true,
          () => false,
        ))
      )
        break;
      dir = path.dirname(dir);
    }
  }
}

export async function prepareLegacyHome(options: {
  dataRoot: string;
  gameDir: string;
  platform?: NodeJS.Platform;
  homeDir?: string;
}): Promise<{ jvm: string[]; env: Record<string, string> } | null> {
  const platform = options.platform ?? process.platform;
  const base = legacyHomeBase(options.dataRoot, platform, options.homeDir);
  await pruneLegacyHomes(base, platform);

  const home = path.join(base, buildLaunchAliasName(options.gameDir));
  const link = defaultDirLink(home, platform);
  const target = path.resolve(options.gameDir);

  const stat = await fs.lstat(link).catch(() => null);
  if (stat && !stat.isSymbolicLink()) return null;
  const current = stat
    ? await fs
        .readlink(link)
        .then(normalizeLinkTarget)
        .catch(() => null)
    : null;
  if (current !== target) {
    if (stat) await fs.unlink(link);
    await fs.ensureDir(path.dirname(link));
    await fs.symlink(target, link, platform === "win32" ? "junction" : "dir");
  }

  return platform === "win32"
    ? { jvm: [], env: { APPDATA: home } }
    : { jvm: [`-Duser.home=${home}`], env: {} };
}

export function legacySessionArgument(
  online: boolean,
  accessToken: string,
  uuid: string,
): string {
  return online ? `token:${accessToken}:${uuid.replace(/-/g, "")}` : "-";
}

export function legacyForgeJvmArguments(
  loader: string,
  usesMinecraftArguments: boolean,
): string[] {
  return loader === "forge" && usesMinecraftArguments
    ? ["-Dfml.ignoreInvalidMinecraftCertificates=true"]
    : [];
}

export function legacyFmlDownloads(
  loader: string,
  mcVersion: string,
  gameDir: string,
): DownloadItem[] {
  const data = loader === "forge" ? FML_DEOBFUSCATION_DATA[mcVersion] : null;
  if (!data) return [];

  const name = `deobfuscation_data_${mcVersion}.zip`;
  return [
    {
      url: `${FML_LIBS_URL}/${name}`,
      destination: path.join(gameDir, "lib", name),
      sha1: data.sha1,
      size: data.size,
      group: "forge",
    },
  ];
}

export async function materializeLegacyAssets(
  index: IAssetIndex,
  objectsDir: string,
  targetDir: string,
): Promise<number> {
  const root = path.resolve(targetDir);
  let copied = 0;

  for (const [name, object] of Object.entries(index.objects ?? {})) {
    if (!object?.hash) continue;
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) continue;

    const stat = await fs.stat(target).catch(() => null);
    if (stat && stat.size === object.size) continue;

    const source = path.join(objectsDir, object.hash.slice(0, 2), object.hash);
    if (!(await fs.pathExists(source))) continue;

    await fs.ensureDir(path.dirname(target));
    await fs.copyFile(source, target);
    copied++;
  }

  return copied;
}
