import { IVersionManifest } from "@/types/IVersionManifest";
import { IArch, IOS } from "@/types/OS";
import { createHash } from "crypto";
import { app } from "electron";
import path from "path";

export function getOS(): {
  os: IOS;
  arch: IArch;
} | null {
  const platform = process.platform;
  const arch = process.arch;

  let os: IOS = "windows";
  switch (platform) {
    case "win32":
      os = "windows";
      break;
    case "darwin":
      os = "osx";
      break;
    case "linux":
      os = "linux";
      break;
    default:
      return null;
  }

  let archName: IArch = "x64";
  switch (arch) {
    case "arm64":
      archName = "arm64";
      break;
    case "x64":
      archName = "x64";
      break;
    default:
      return null;
  }

  return { os, arch: archName };
}

export function convertMavenCoordinateToJarPath(coordinate: string): string {
  const parts = coordinate.split(":");

  if (parts.length !== 3) {
    return "";
  }

  const groupId = parts[0].replace(/\./g, "/");
  const artifactId = parts[1];
  const version = parts[2];

  return `${groupId}/${artifactId}/${version}/${artifactId}-${version}.jar`;
}

export function removeDuplicatesLibraries(
  items: IVersionManifest["libraries"],
): IVersionManifest["libraries"] {
  const uniqueNames = new Set<string>();

  return items.filter((item) => {
    if (item.natives) return true;

    const normalizedName = item.name.replace("@jar", "");

    if (uniqueNames.has(normalizedName)) {
      return false;
    }

    uniqueNames.add(normalizedName);
    return true;
  });
}

export function getFullLangCode(lang: {
  code: string;
  country: string;
}): string {
  return `${lang.code}_${lang.country.toLowerCase()}`;
}

export function getJavaAgent(
  accountType: "elyby" | "discord",
  authinjPath: string,
  isQuotes = false,
): string {
  let authServer = "";
  switch (accountType) {
    case "elyby":
      authServer = `ely.by`;
      break;
    case "discord":
      authServer = `grubielauncher.com`;
      break;
  }

  if (isQuotes) {
    authinjPath = `"${authinjPath}"`;
  }
  return `-javaagent:${authinjPath}=${authServer}`;
}

export function toUUID(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getLauncherPaths() {
  const appData = app.getPath("appData");
  const launcher = path.join(appData, ".grubielauncher");

  return {
    launcher: launcher,
    minecraft: path.join(launcher, "minecraft"),
    java: path.join(launcher, "java"),
    skins: path.join(launcher, "skins"),
  };
}

export function generateOfflineUUID(username: string): string {
  const hash = createHash("md5")
    .update(`OfflinePlayer:${username}`)
    .digest("hex");
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "3" + hash.substring(13, 16),
    hash.substring(16, 20),
    hash.substring(20, 32),
  ].join("");
}
