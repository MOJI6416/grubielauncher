import { useEffect, useRef, useState } from "react";
import { Version } from "@renderer/classes/Version";
import { ILocalProject } from "@/types/ModManager";
import { IServer } from "@/types/ServersList";
import { IArguments } from "@/types/IArguments";
import type { InstanceSettingsOverrides } from "@/shared/instanceSettings";
import {
  ContentChanges,
  InstanceChangeKind,
  collectInstanceChanges,
  sameChangeKinds,
} from "@renderer/features/instances/instanceOverview";

const api = window.api;

export function useVersionChanges({
  version,
  versionName,
  mods,
  servers,
  nbtServers,
  runArguments,
  isLogoChanged,
  quickConnectIp,
  overrides,
  isLoading,
  isReady,
}: {
  version: Version | undefined;
  versionName: string;
  mods: ILocalProject[];
  servers: IServer[];
  nbtServers: IServer[];
  runArguments: IArguments;
  isLogoChanged: boolean;
  quickConnectIp: string | undefined;
  overrides: InstanceSettingsOverrides | undefined;
  isLoading: boolean;
  isReady: boolean;
}) {
  const [changeKinds, setChangeKinds] = useState<InstanceChangeKind[]>([]);
  const [content, setContent] = useState<ContentChanges | null>(null);
  const calcSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const seq = ++calcSeqRef.current;

    const compare = async () => {
      if (!version) {
        setContent(null);
        return;
      }

      if (isLoading) return;

      const next: ContentChanges = { mods: false, servers: false };

      try {
        next.mods = !(await api.modManager.compareMods(
          version.version.loader.mods ?? [],
          mods,
        ));
      } catch {
        next.mods = false;
      }

      if (version.version.version.serverManager && isReady) {
        try {
          next.servers = !(await api.servers.compare(nbtServers, servers));
        } catch {
          next.servers = false;
        }
      }

      if (cancelled || seq !== calcSeqRef.current) return;

      setContent((prev) =>
        prev && prev.mods === next.mods && prev.servers === next.servers
          ? prev
          : next,
      );
    };

    compare();

    return () => {
      cancelled = true;
    };
  }, [version, mods, servers, nbtServers, isLoading, isReady]);

  useEffect(() => {
    if (!version) {
      setChangeKinds((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    if (isLoading || !content) return;

    const kinds = collectInstanceChanges({
      draftName: versionName,
      currentName: version.version.name,
      draftArguments: runArguments,
      currentArguments: version.version.runArguments,
      draftQuickServer: quickConnectIp,
      currentQuickServer: version.version.quickServer,
      draftOverrides: overrides,
      currentOverrides: version.version.overrides,
      isLogoChanged,
      content,
    });

    setChangeKinds((prev) => (sameChangeKinds(prev, kinds) ? prev : kinds));
  }, [
    version,
    versionName,
    runArguments.game,
    runArguments.jvm,
    isLogoChanged,
    quickConnectIp,
    overrides,
    content,
    isLoading,
  ]);

  const hasOnlyDownloadedRename =
    !!version?.version.downloadedVersion &&
    changeKinds.length === 1 &&
    changeKinds[0] === "name";

  return {
    hasChanges: changeKinds.length > 0,
    hasOnlyDownloadedRename,
    changeKinds,
  };
}
