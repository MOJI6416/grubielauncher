import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { versionsAtom } from "@renderer/stores/atoms";
import { instanceKey } from "@renderer/features/instances/selectors";
import { useInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { buildFeed, type FeedInstance, type FeedShot } from "./feedModel";

const api = window.api;

export function useScreenshotFeed(): {
  shots: FeedShot[] | null;
  failed: number;
} {
  const versions = useAtomValue(versionsAtom);
  const revision = useInstanceDataRevision();
  const [state, setState] = useState<{
    shots: FeedShot[] | null;
    failed: number;
  }>({ shots: null, failed: 0 });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let failed = 0;
      const sources = await Promise.all(
        versions.map(async (version) => {
          const instance: FeedInstance = {
            key: instanceKey(version),
            name: version.version.name,
            folder: api.path.join(version.versionPath, "screenshots"),
          };
          try {
            if (!(await api.fs.pathExists(instance.folder))) {
              return { instance, names: [] };
            }
            return { instance, names: await api.fs.readdir(instance.folder) };
          } catch (error) {
            failed += 1;
            console.warn("[screenshots] folder unreadable", instance.folder, error);
            return { instance, names: [] };
          }
        }),
      );

      if (cancelled) return;
      setState({ shots: buildFeed(sources, api.path.join), failed });
    })();

    return () => {
      cancelled = true;
    };
  }, [versions, revision]);

  return state;
}
