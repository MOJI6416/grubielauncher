import { useCallback, useEffect, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { IServer } from "@/types/ServersList";
import { Version } from "@renderer/classes/Version";
import { versionServersAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { readInstanceServers } from "./instanceServers";
import { mergeExternalServers } from "./saveDecisions";

const api = window.api;

export function useInstanceServers(
  version: Version | undefined,
  onChanged: () => void,
) {
  const { t } = useTranslation();
  const setStored = useSetAtom(versionServersAtom);
  const [servers, setServersState] = useState<IServer[]>([]);
  const [isReady, setIsReady] = useState(false);
  const serversRef = useRef<IServer[]>([]);
  const persistedRef = useRef<IServer[]>([]);
  const onChangedRef = useLatestRef(onChanged);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const show = useCallback((next: IServer[]) => {
    serversRef.current = next;
    setServersState(next);
  }, []);

  useEffect(() => {
    if (!version) return;

    let cancelled = false;

    (async () => {
      const list = version.version.version.serverManager
        ? ((await readInstanceServers(version.versionPath)) ?? [])
        : [];

      if (cancelled) return;

      persistedRef.current = list;
      setStored(list);
      show(list);
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const write = useCallback(
    async (next: IServer[]) => {
      if (!version) return;
      const baseline = persistedRef.current;

      try {
        const onDisk = await readInstanceServers(version.versionPath);
        if (!onDisk) throw new Error("servers read failed");

        const merged = mergeExternalServers(next, onDisk, baseline);
        const serversPath = await api.path.join(
          version.versionPath,
          "servers.dat",
        );

        if (!(await api.servers.write(merged, serversPath))) {
          throw new Error("servers write failed");
        }

        persistedRef.current = merged;
        setStored([...merged]);
        if (merged !== next) show(merged);
        onChangedRef.current();
      } catch (error) {
        show(baseline);
        showFailureToast(t("versions.serversSaveError"), error, {
          channels: ["servers:write", "servers:read"],
          fallbackDescription: t("versions.serversSaveErrorHint"),
        });
      }
    },
    [version, t],
  );

  const setServers = useCallback(
    (update: IServer[] | ((previous: IServer[]) => IServer[])) => {
      const next =
        typeof update === "function" ? update(serversRef.current) : update;
      if (next === serversRef.current) return;

      show(next);
      chainRef.current = chainRef.current
        .then(() => write(next))
        .catch(ignoreFailure);
    },
    [show, write],
  );

  return { servers, setServers, isReady };
}
