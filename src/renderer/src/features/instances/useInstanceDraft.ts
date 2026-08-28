import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { IArguments } from "@/types/IArguments";
import { ILocalProject } from "@/types/ModManager";
import { IServer } from "@/types/ServersList";
import type { InstanceSettingsOverrides } from "@/shared/instanceSettings";
import { Version } from "@renderer/classes/Version";
import { versionServersAtom } from "@renderer/stores/atoms";
import { readInstanceServers } from "./instanceServers";

const EMPTY_ARGUMENTS: IArguments = { game: "", jvm: "" };

export function useInstanceDraft(version: Version | undefined) {
  const [nbtServers, setNbtServers] = useAtom(versionServersAtom);

  const [name, setName] = useState(() => version?.version.name ?? "");
  const [mods, setMods] = useState<ILocalProject[]>(
    () => version?.version.loader.mods || [],
  );
  const [pendingRemovedLocalMods, setPendingRemovedLocalMods] = useState<
    ILocalProject[]
  >([]);
  const [servers, setServers] = useState<IServer[]>([]);
  const [runArguments, setRunArguments] = useState<IArguments>(
    () => version?.version.runArguments || { ...EMPTY_ARGUMENTS },
  );
  const [image, setImage] = useState(() => version?.version.image ?? "");
  const [isLogoChanged, setIsLogoChanged] = useState(false);
  const [editName, setEditName] = useState(false);
  const [overrides, setOverrides] = useState<
    InstanceSettingsOverrides | undefined
  >(() => version?.version.overrides);
  const [quickConnectIp, setQuickConnectIp] = useState(
    () => version?.version.quickServer,
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!version) return;

    let cancelled = false;

    (async () => {
      const stored = version.version.version.serverManager
        ? ((await readInstanceServers(version.versionPath)) ?? [])
        : [];

      if (cancelled) return;

      setNbtServers(stored);
      setServers(stored);
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function reset() {
    if (!version) return;

    setImage(version.version.image);
    setName(version.version.name);
    setMods(version.version.loader.mods || []);
    setPendingRemovedLocalMods([]);
    setRunArguments(version.version.runArguments || { ...EMPTY_ARGUMENTS });
    setOverrides(version.version.overrides);
    setServers(version.version.version.serverManager ? nbtServers : []);
    setQuickConnectIp(version.version.quickServer);
    setIsLogoChanged(false);
    setEditName(false);
  }

  return {
    name,
    setName,
    mods,
    setMods,
    pendingRemovedLocalMods,
    setPendingRemovedLocalMods,
    servers,
    setServers,
    nbtServers,
    setNbtServers,
    runArguments,
    setRunArguments,
    image,
    setImage,
    isLogoChanged,
    setIsLogoChanged,
    editName,
    setEditName,
    overrides,
    setOverrides,
    quickConnectIp,
    setQuickConnectIp,
    isReady,
    reset,
  };
}

export type InstanceDraft = ReturnType<typeof useInstanceDraft>;
