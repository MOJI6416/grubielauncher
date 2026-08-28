import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ILocalProject,
  IVersion as ModVersion,
  ProjectType,
} from "@/types/ModManager";
import type { IUpdateCheckItem } from "@/types/Updates";
import { Loader } from "@/types/Loader";
import { entryKey } from "./entries";
import { UpdateState, isCheckableProject } from "./updates";
import {
  buildUpdateItems,
  chunkUpdateItems,
  readUpdateVerdicts,
} from "./updateQuery";

const api = window.api;

const cache = new Map<string, UpdateState>();

function cacheKey(
  key: string,
  versionId: string,
  gameVersion: string,
  loader: Loader | string,
): string {
  return `${key}|${versionId}|${gameVersion}|${loader}`;
}

export interface UpdateCheckResult {
  states: Map<string, UpdateState>;
  updatable: Set<string>;
  unavailable: Set<string>;
  unchecked: Set<string>;
  latest: Map<string, ModVersion>;
  isChecking: boolean;
  checked: number;
  pending: number;
  check: (force?: boolean) => void;
}

export function useUpdateCheck({
  mods,
  projectType,
  gameVersion,
  loader,
  enabled,
}: {
  mods: ILocalProject[];
  projectType: ProjectType;
  gameVersion: string | undefined;
  loader: Loader | string;
  enabled: boolean;
}): UpdateCheckResult {
  const [revision, setRevision] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const runIdRef = useRef(0);

  const checkable = useMemo(
    () => mods.filter((mod) => isCheckableProject(mod)),
    [mods],
  );

  const targets = useMemo(
    () => checkable.filter((mod) => mod.projectType === projectType),
    [checkable, projectType],
  );

  const signature = checkable
    .map((mod) => `${mod.provider}:${mod.id}:${mod.version?.id ?? ""}`)
    .join(",");

  const run = useCallback(async (force = false) => {
    if (!gameVersion) return;

    const items = buildUpdateItems(checkable);
    if (items.length === 0) {
      setIsChecking(false);
      return;
    }

    const keyOf = (item: IUpdateCheckItem) =>
      cacheKey(
        entryKey(item.provider, item.id),
        item.versionId ?? "",
        gameVersion,
        loader,
      );

    if (force) {
      for (const item of items) cache.delete(keyOf(item));
      setRevision((value) => value + 1);
    }

    const missing = items.filter((item) => !cache.has(keyOf(item)));
    if (missing.length === 0) {
      setIsChecking(false);
      return;
    }

    const runId = ++runIdRef.current;
    setIsChecking(true);

    for (const chunk of chunkUpdateItems(missing)) {
      if (runId !== runIdRef.current) return;

      const response = await api.backend
        .checkUpdates({
          gameVersion,
          loader: String(loader),
          items: chunk,
        })
        .catch(() => null);

      if (runId !== runIdRef.current) return;

      const outcomes = readUpdateVerdicts(chunk, response?.items);
      const versionByKey = new Map(
        chunk.map((item) => [
          entryKey(item.provider, item.id),
          item.versionId ?? "",
        ]),
      );
      for (const [key, state] of outcomes) {
        cache.set(
          cacheKey(key, versionByKey.get(key) ?? "", gameVersion, loader),
          state,
        );
      }
      setRevision((value) => value + 1);
    }

    if (runId === runIdRef.current) setIsChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameVersion, loader, signature]);

  useEffect(() => {
    if (!enabled) {
      runIdRef.current += 1;
      setIsChecking(false);
      return;
    }

    void run();

    return () => {
      runIdRef.current += 1;
    };
  }, [enabled, run]);

  return useMemo(() => {
    const states = new Map<string, UpdateState>();
    const updatable = new Set<string>();
    const unavailable = new Set<string>();
    const unchecked = new Set<string>();
    const latest = new Map<string, ModVersion>();
    let checked = 0;

    if (gameVersion) {
      for (const mod of targets) {
        const id = entryKey(mod.provider, mod.id);
        const state = cache.get(
          cacheKey(id, mod.version?.id ?? "", gameVersion, loader),
        );
        if (!state) continue;

        checked += 1;
        states.set(id, state);

        if (state.status === "update" && state.latest) {
          updatable.add(id);
          latest.set(id, state.latest);
        }
        if (state.status === "unavailable") unavailable.add(id);
        if (state.status === "unknown") unchecked.add(id);
      }
    }

    return {
      states,
      updatable,
      unavailable,
      unchecked,
      latest,
      isChecking,
      checked,
      pending: targets.length - checked,
      check: (force?: boolean) => void run(force),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, gameVersion, loader, isChecking, revision, run]);
}

export function forgetUpdateCache(): void {
  cache.clear();
}
