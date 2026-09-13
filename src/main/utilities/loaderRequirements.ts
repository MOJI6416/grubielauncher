import path from "path";
import fs from "fs-extra";
import type { Dirent } from "fs";
import {
  LOADER_DEPENDENCY_IDS,
  LoaderRequirement,
  LoaderRequirementsScan,
  isModdedLoader,
} from "@/shared/loaderCompat";
import { getModDescriptor } from "./modManager";

const SCAN_CHUNK = 16;

export async function readInstanceLoaderRequirements(
  versionPath: string,
  loader: string,
): Promise<LoaderRequirementsScan> {
  if (!isModdedLoader(loader)) return { scanned: 0, requirements: [] };

  const modsPath = path.join(versionPath, "mods");
  const entries = await fs
    .readdir(modsPath, { withFileTypes: true })
    .catch((): Dirent[] => []);
  const jars = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const dependency = LOADER_DEPENDENCY_IDS[loader];
  const requirements: LoaderRequirement[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < jars.length; index += SCAN_CHUNK) {
    const described = await Promise.all(
      jars.slice(index, index + SCAN_CHUNK).map(async (file) => ({
        file,
        descriptor: await getModDescriptor(path.join(modsPath, file)),
      })),
    );

    for (const { file, descriptor } of described) {
      for (const requirement of descriptor.loaderRequirements) {
        if (requirement.dependency !== dependency) continue;

        const key = `${file}|${requirement.ranges.join("||")}`;
        if (seen.has(key)) continue;
        seen.add(key);

        requirements.push({
          file,
          modId: descriptor.modId,
          name: descriptor.name,
          syntax: requirement.syntax,
          ranges: [...requirement.ranges],
        });
      }
    }
  }

  return { scanned: jars.length, requirements };
}
