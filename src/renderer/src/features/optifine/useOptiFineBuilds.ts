import { useCallback, useEffect, useState } from "react";
import type { OptiFineBuild, OptiFineChoice } from "@/shared/optifine";

const api = window.api;

export interface OptiFineBuildsState {
  builds: OptiFineBuild[];
  isLoading: boolean;
  failed: boolean;
  reload: () => void;
}

export function useOptiFineBuilds(
  minecraft: string | undefined,
  enabled: boolean,
): OptiFineBuildsState {
  const [builds, setBuilds] = useState<OptiFineBuild[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !minecraft) {
      setBuilds([]);
      setIsLoading(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setFailed(false);

    void api.optifine
      .builds(minecraft, attempt > 0)
      .then((list) => {
        if (cancelled) return;
        setBuilds(list ?? []);
        setFailed(list === null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, enabled, minecraft]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { builds, isLoading, failed, reload };
}

export function useOptiFineStored(
  choice: OptiFineChoice | null | undefined,
  revision = 0,
): boolean | null {
  const [stored, setStored] = useState<boolean | null>(null);
  const file = choice?.file;

  useEffect(() => {
    if (!choice) {
      setStored(null);
      return;
    }

    let cancelled = false;
    void api.optifine
      .isStored(choice)
      .then((value) => {
        if (!cancelled) setStored(value);
      })
      .catch(() => {
        if (!cancelled) setStored(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, revision]);

  return stored;
}
