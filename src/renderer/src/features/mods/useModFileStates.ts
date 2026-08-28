import { useEffect, useState } from "react";
import { ProjectType } from "@/types/ModManager";
import { ContentEntry, canToggleType } from "./entries";
import { folderNameForType, forgetModFiles, listModFiles } from "./modFiles";

export interface ModFileStates {
  disabled: Set<string>;
  present: Set<string>;
  ready: boolean;
}

const EMPTY: ModFileStates = {
  disabled: new Set(),
  present: new Set(),
  ready: false,
};

export function useModFileStates(
  versionPath: string | undefined,
  projectType: ProjectType,
  entries: ContentEntry[],
  revision: number,
): ModFileStates {
  const [states, setStates] = useState<ModFileStates>(EMPTY);

  const signature = entries.map((entry) => `${entry.key}|${entry.fileName}`).join(",");

  useEffect(() => {
    if (!versionPath || !canToggleType(projectType)) {
      setStates(EMPTY);
      return;
    }

    let cancelled = false;

    (async () => {
      const listing = await listModFiles(versionPath, projectType);
      if (cancelled) return;

      const disabled = new Set<string>();
      const present = new Set<string>();

      for (const entry of entries) {
        if (!entry.fileName) continue;

        const hasEnabled = listing.has(entry.fileName);
        const hasDisabled = listing.has(`${entry.fileName}.disabled`);

        if (hasEnabled || hasDisabled) present.add(entry.key);
        if (hasDisabled) disabled.add(entry.key);
      }

      setStates({ disabled, present, ready: true });
    })().catch(() => {
      if (!cancelled) setStates({ ...EMPTY, ready: true });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionPath, projectType, signature, revision]);

  return states;
}

export async function toggleModFile(
  versionPath: string,
  projectType: ProjectType,
  fileName: string,
  disable: boolean,
): Promise<void> {
  const api = window.api;
  const folderName = await folderNameForType(projectType);
  const folderPath = await api.path.join(versionPath, folderName);

  const enabledPath = await api.path.join(folderPath, fileName);
  const disabledPath = await api.path.join(folderPath, `${fileName}.disabled`);

  const from = disable ? enabledPath : disabledPath;
  const to = disable ? disabledPath : enabledPath;

  if (!(await api.fs.pathExists(from))) throw new Error("missing");

  const renamed = await api.fs.rename(from, to);
  if (!renamed) throw new Error("rename");

  await forgetModFiles(versionPath, projectType);
}
