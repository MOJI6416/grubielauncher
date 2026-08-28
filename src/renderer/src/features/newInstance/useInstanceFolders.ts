import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { pathsAtom, versionsAtom } from "@renderer/stores/atoms";

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
      const list = await api.fs.getDirectories(versionsPath).catch(() => []);
      if (!cancelled) setNames(Array.isArray(list) ? list : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [paths.minecraft, versions.length]);

  return names;
}
