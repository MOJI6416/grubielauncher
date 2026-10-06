import path from "path";
import fs from "fs-extra";
import { randomUUID } from "crypto";
import type { IJarMod } from "@/types/IVersion";
import { hasBtaLauncherManifest } from "@/shared/btaLoader";

export interface PrismComponent {
  uid?: string;
  version?: string;
  cachedName?: string;
  cachedVersion?: string;
  disabled?: boolean;
}

interface PrismJarEntry {
  name?: string;
  "MMC-filename"?: string;
  "MMC-displayname"?: string;
  "MMC-hint"?: string;
}

interface PrismPatch {
  version?: string;
  jarMods?: PrismJarEntry[];
  "+jarMods"?: PrismJarEntry[];
  mainJar?: PrismJarEntry;
}

export interface PrismJarImport {
  jarMods: IJarMod[];
  mainJar?: IJarMod;
  btaVersion?: string;
}

const SAFE_UID = /^[A-Za-z0-9._-]+$/;
const SAFE_FILE = /^[^/\\]+\.(?:jar|zip)$/i;
const BTA_JAR_MOD =
  /^(?:custom\.jarmods:bta:|org\.multimc\.jarmods:bta:|net\.betterthanadventure:)/;

function storedFileName(
  entry: PrismJarEntry,
  withVersion: boolean,
): string | null {
  const explicit = entry["MMC-filename"];
  if (explicit) return SAFE_FILE.test(explicit) ? explicit : null;

  const [, artifact, version] = (entry.name ?? "").split(":");
  if (!artifact) return null;

  const file = withVersion && version ? `${artifact}-${version}.jar` : `${artifact}.jar`;
  return SAFE_FILE.test(file) ? file : null;
}

function btaVersionOf(component: PrismComponent, patch: PrismPatch | null) {
  const raw = (
    patch?.version ??
    component.version ??
    component.cachedVersion ??
    ""
  ).trim();
  if (!raw) return undefined;
  return raw.startsWith("v") ? raw : `v${raw}`;
}

async function copyIntoOverrides(
  source: string,
  overridesPath: string,
): Promise<string | null> {
  if (!(await fs.pathExists(source))) return null;

  const extension = path.extname(source).toLowerCase() === ".zip" ? "zip" : "jar";
  const file = `${randomUUID()}.${extension}`;
  await fs.copy(source, path.join(overridesPath, "jarmods", file));
  return file;
}

export async function readPrismJarMods(
  instanceRoot: string,
  components: PrismComponent[],
  overridesPath: string,
): Promise<PrismJarImport> {
  const result: PrismJarImport = { jarMods: [] };

  for (const component of components) {
    const uid = component.uid;
    if (!uid || !SAFE_UID.test(uid) || uid === "net.minecraft") continue;

    const patch: PrismPatch | null = await fs
      .readJSON(path.join(instanceRoot, "patches", `${uid}.json`))
      .catch(() => null);
    const entries = patch?.jarMods ?? patch?.["+jarMods"] ?? [];
    const enabled = component.disabled !== true;

    const isBta =
      uid.endsWith("jarmod.bta") ||
      entries.some((entry) => BTA_JAR_MOD.test(entry.name ?? ""));
    if (isBta) {
      const version = btaVersionOf(component, patch);
      if (enabled && version && hasBtaLauncherManifest(version)) {
        result.btaVersion = version;
        continue;
      }
    }

    for (const entry of entries) {
      const stored = storedFileName(entry, false);
      if (!stored) continue;

      const file = await copyIntoOverrides(
        path.join(instanceRoot, "jarmods", stored),
        overridesPath,
      );
      if (!file) continue;

      result.jarMods.push({
        file,
        name: entry["MMC-displayname"] || component.cachedName || stored,
        enabled,
      });
    }

    if (patch?.mainJar && (uid === "customjar" || patch.mainJar["MMC-hint"] === "local")) {
      const stored = storedFileName(patch.mainJar, true);
      const file = stored
        ? await copyIntoOverrides(
            path.join(instanceRoot, "libraries", stored),
            overridesPath,
          )
        : null;

      if (file && stored) {
        result.mainJar = {
          file,
          name: patch.mainJar["MMC-displayname"] || component.cachedName || stored,
          enabled,
        };
      }
    }
  }

  return result;
}
