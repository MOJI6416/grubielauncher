import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { DownloadSource, normalizeSettings } from "@/types/Settings";
import { ConnectivityCheckResult } from "@/types/Connectivity";

let downloadSource: DownloadSource = "auto";
let mojangReachable: boolean | null = null;

const MIRROR_FAILURE_THRESHOLD = 5;
const MIRROR_COOLDOWN_MS = 5 * 60 * 1000;

let mirrorFailures = 0;
let mirrorDisabledUntil = 0;

export function isMirrorDisabled(): boolean {
  if (mirrorDisabledUntil === 0) return false;
  if (Date.now() >= mirrorDisabledUntil) {
    mirrorDisabledUntil = 0;
    mirrorFailures = 0;
    return false;
  }
  return true;
}

export function reportMirrorFailure(): void {
  mirrorFailures += 1;
  if (mirrorFailures >= MIRROR_FAILURE_THRESHOLD) {
    mirrorDisabledUntil = Date.now() + MIRROR_COOLDOWN_MS;
  }
}

export function reportMirrorSuccess(): void {
  mirrorFailures = 0;
  mirrorDisabledUntil = 0;
}

export function resetMirrorCircuitBreaker(): void {
  mirrorFailures = 0;
  mirrorDisabledUntil = 0;
}

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
