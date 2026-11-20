import { useEffect, useMemo, useState } from "react";
import { ProjectType, type ICatalogPresenceItem } from "@/types/ModManager";
import { ContentEntry } from "./entries";
import { isIdentifiable } from "./identify";
import { folderNameForType } from "./modFiles";
import type { ModFileStates } from "./useModFileStates";

const api = window.api;

const NONE = new Set<string>();

export function useCatalogPresence(
  instancePath: string | undefined,
  projectType: ProjectType,
  entries: ContentEntry[],
  fileStates: ModFileStates,
): ReadonlySet<string> {
  const [unknown, setUnknown] = useState<ReadonlySet<string>>(NONE);

  const targets = useMemo(
    () =>
      projectType === ProjectType.MOD && instancePath && fileStates.ready
        ? entries.filter(
            (entry) =>
              isIdentifiable(entry) && fileStates.present.has(entry.key),
          )
        : [],
    [entries, fileStates, instancePath, projectType],
  );
  const signature = targets
    .map(
      (entry) =>
        `${entry.key}|${entry.fileName}|${fileStates.disabled.has(entry.key) ? 1 : 0}`,
    )
    .join(",");

  useEffect(() => {
    if (!instancePath || targets.length === 0) {
      setUnknown(NONE);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const folder = await folderNameForType(projectType);
        const items: ICatalogPresenceItem[] = targets.map((entry) => ({
          key: entry.key,
          sha1: entry.installed?.version?.files[0]?.sha1 || undefined,
          path: api.path.join(
            instancePath,
            folder,
            fileStates.disabled.has(entry.key)
              ? `${entry.fileName}.disabled`
              : entry.fileName,
          ),
        }));
        const result = await api.modManager.catalogPresence(items);
        if (!cancelled) setUnknown(new Set(result.unknown));
      })().catch(() => {
        if (!cancelled) setUnknown(NONE);
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instancePath, projectType, signature]);

  return unknown;
}
