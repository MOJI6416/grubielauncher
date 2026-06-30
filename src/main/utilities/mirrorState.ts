import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { DownloadSource, normalizeSettings } from "@/types/Settings";
import { ConnectivityCheckResult } from "@/types/Connectivity";

let downloadSource: DownloadSource = "auto";
let mojangReachable: boolean | null = null;

export function getDownloadSource(): DownloadSource {
  return downloadSource;
}

export function setDownloadSource(source: DownloadSource): void {
  downloadSource = source;
}

export function getMojangReachable(): boolean | null {
  return mojangReachable;
}

export function setMojangReachable(value: boolean | null): void {
  mojangReachable = value;
}

export async function probeMojangReachable(): Promise<boolean> {
  try {
    const response = await axios.get(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
      {
        timeout: 5000,
        maxRedirects: 0,
        responseType: "stream",
        headers: { Range: "bytes=0-0" },
        validateStatus: () => true,
      },
    );
    try {
      response.data?.destroy?.();
    } catch {}
    setMojangReachable(true);
    return true;
  } catch {
    setMojangReachable(false);
    return false;
  }
}

export function updateMojangReachableFromConnectivity(
  results: ConnectivityCheckResult[],
): void {
  const mojang = results.filter((r) => r.group === "minecraft");
  if (mojang.length === 0) return;
  setMojangReachable(mojang.some((r) => r.ok));
}

export async function initMirrorState(launcherPath: string): Promise<void> {
  try {
    const settingsPath = path.join(launcherPath, "settings.json");
    if (await fs.pathExists(settingsPath)) {
      const raw = await fs.readJSON(settingsPath);
      setDownloadSource(normalizeSettings(raw).downloadSource);
    }
  } catch {}

  void probeMojangReachable();
}
