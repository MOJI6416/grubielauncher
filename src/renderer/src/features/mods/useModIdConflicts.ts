import { useEffect, useMemo, useState } from "react";
import type { ModIdConflict } from "@/types/ModBisect";
import type { ILocalProject } from "@/types/ModManager";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { entryKey } from "./entries";

const EMPTY: ModIdConflict[] = [];

export function conflictEntryKeys(
  conflicts: readonly ModIdConflict[],
  mods: readonly ILocalProject[],
): Set<string> {
  const files = new Set(
    conflicts.flatMap((conflict) =>
      conflict.files.map((file) => file.fileName.toLowerCase()),
    ),
  );
  const keys = new Set<string>();
  if (files.size === 0) return keys;
  for (const mod of mods) {
    const owns = (mod.version?.files ?? []).some((file) =>
      files.has(
        String(file.filename ?? "")
          .replace(/\.disabled$/i, "")
          .toLowerCase(),
      ),
    );
    if (owns) keys.add(entryKey(mod.provider, mod.id));
  }
  return keys;
}

export function useModIdConflicts(
  versionPath: string | undefined,
  enabled: boolean,
  mods: readonly ILocalProject[],
  revision: number,
): { conflicts: ModIdConflict[]; keys: Set<string> } {
  const [state, setState] = useState<{
    path: string;
    conflicts: ModIdConflict[];
  } | null>(null);

  useEffect(() => {
    if (!versionPath || !enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void window.api.modManager
        .modIdConflicts(versionPath)
        .catch(ignoreFailure)
        .then((conflicts) => {
          if (!cancelled)
            setState({ path: versionPath, conflicts: conflicts ?? EMPTY });
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, mods, revision, versionPath]);

  const conflicts =
    enabled && state && state.path === versionPath ? state.conflicts : EMPTY;
  const keys = useMemo(() => conflictEntryKeys(conflicts, mods), [conflicts, mods]);
  return { conflicts, keys };
}
