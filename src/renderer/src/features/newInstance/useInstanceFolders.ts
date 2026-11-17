import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { pathsAtom, versionsAtom } from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export function useInstanceFolderNames(): string[] {
  const paths = useAtomValue(pathsAtom);
  const versions = useAtomValue(versionsAtom);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!paths.minecraft) return;

    let cancelled = false;

    void (async () => {
      const versionsPath = await api.path.join(paths.minecraft, "versions");
      const list = await api.fs
        .getDirectories(versionsPath)
        .catch(ignoreFailure);
      if (!cancelled) setNames(Array.isArray(list) ? list : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [paths.minecraft, versions.length]);

  return names;
}
