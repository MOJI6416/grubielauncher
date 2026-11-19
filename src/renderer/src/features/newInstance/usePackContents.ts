import { useCallback, useEffect, useState } from "react";
import type { IProject, IVersion as IProjectVersion } from "@/types/ModManager";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import type { PackContentItem } from "./PackContentList";

const api = window.api;

interface Loaded {
  key: string;
  status: "ready" | "failed";
  items: PackContentItem[];
}

export function usePackContents(
  project: IProject | null,
  version: IProjectVersion | null,
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key =
    project && version ? `${project.provider}:${project.id}:${version.id}` : null;

  useEffect(() => {
    if (!project || !version || !key) return;
    let cancelled = false;

    void api.modManager
      .packContents(project.provider, project.id, version)
      .catch(ignoreFailure)
      .then((result) => {
        if (cancelled) return;
        setLoaded({
          key,
          status: result ? "ready" : "failed",
          items: result?.items ?? [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);

  const current = loaded && loaded.key === key ? loaded : null;

  return {
    status: !key ? "idle" : (current?.status ?? "loading"),
    items: current?.items ?? [],
    retry,
  };
}
