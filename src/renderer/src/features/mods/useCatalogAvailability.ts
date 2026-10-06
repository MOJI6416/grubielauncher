import { useEffect, useState } from "react";
import { Loader } from "@/types/Loader";
import { ProjectType } from "@/types/ModManager";
import {
  AvailabilityMap,
  CATALOG_PROVIDERS,
  CatalogProvider,
  CatalogTarget,
  combineProbes,
  fittingTypes,
  probeKey,
  probeLoaders,
} from "./catalogAvailability";

const api = window.api;

const PROBE_TTL_MS = 30 * 60 * 1000;

const probes = new Map<string, { at: number; task: Promise<number | null> }>();

function probeTotal(
  provider: CatalogProvider,
  type: ProjectType,
  mcVersion: string | undefined,
  loader: string | undefined,
): Promise<number | null> {
  const key = probeKey(provider, type, mcVersion, loader);
  const cached = probes.get(key);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.task;

  const task = api.modManager
    .search(
      "",
      provider,
      {
        version: mcVersion,
        loader: loader as Loader | undefined,
        projectType: type,
        sort: "",
        filter: [],
      },
      { offset: 0, limit: 1 },
    )
    .then((data) => (data && !data.error ? data.total : null))
    .catch(() => null);

  probes.set(key, { at: Date.now(), task });
  void task.then((total) => {
    if (total === null && probes.get(key)?.task === task) probes.delete(key);
  });

  return task;
}

export function useCatalogAvailability(
  target: CatalogTarget,
  enabled: boolean,
): AvailabilityMap {
  const signature = [
    target.loader ?? "",
    target.server?.core ?? "",
    target.mcVersion ?? "",
  ].join("|");
  const [state, setState] = useState<{
    signature: string;
    map: AvailabilityMap;
  }>({ signature: "", map: {} });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    for (const provider of CATALOG_PROVIDERS) {
      const types = fittingTypes(provider, target);

      void Promise.all(
        types.map(async (type) => {
          const totals = await Promise.all(
            probeLoaders(type, target).map((loader) =>
              probeTotal(provider, type, target.mcVersion, loader),
            ),
          );
          return [type, combineProbes(totals)] as const;
        }),
      ).then((entries) => {
        if (cancelled) return;
        setState((previous) => ({
          signature,
          map: {
            ...(previous.signature === signature ? previous.map : {}),
            [provider]: Object.fromEntries(entries),
          },
        }));
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);

  return state.signature === signature ? state.map : {};
}
