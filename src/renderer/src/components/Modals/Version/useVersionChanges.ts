import { useEffect, useRef, useState } from "react";
import { Version } from "@renderer/classes/Version";
import { ILocalProject } from "@/types/ModManager";
import { IServer } from "@/types/ServersList";
import { IArguments } from "@/types/IArguments";

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
  isLoading,
}: {
  version: Version | undefined;
  versionName: string;
  mods: ILocalProject[];
  servers: IServer[];
  nbtServers: IServer[];
  runArguments: IArguments;
  isLogoChanged: boolean;
  quickConnectIp: string | undefined;
  isLoading: boolean;
}) {
  const [hasChanges, setHasChanges] = useState(false);
  const [hasOnlyDownloadedRename, setHasOnlyDownloadedRename] = useState(false);
  const calcSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const seq = ++calcSeqRef.current;

    const calc = async () => {
      if (!version) {
        setHasChanges(false);
        setHasOnlyDownloadedRename(false);
        return;
      }

      if (isLoading) return;

      const nameChanged = versionName.trim() !== (version.version.name ?? "");

      const argsChanged =
        runArguments.game !== (version.version.runArguments?.game ?? "") ||
        runArguments.jvm !== (version.version.runArguments?.jvm ?? "");

      const otherChanged =
        isLogoChanged || version.version.quickServer !== quickConnectIp;

      let modsChanged = false;
      let serversChanged = false;

      try {
        modsChanged = !(await api.modManager.compareMods(
          version.version.loader.mods ?? [],
          mods,
        ));
      } catch {
        modsChanged = false;
      }

      if (version.version.version.serverManager) {
        try {
          serversChanged = !(await api.servers.compare(nbtServers, servers));
        } catch {
          serversChanged = false;
        }
      }

      if (cancelled || seq !== calcSeqRef.current) return;

      const onlyNameChanged =
        nameChanged &&
        !modsChanged &&
        !serversChanged &&
        !argsChanged &&
        !otherChanged;
      const hasAnyChanges =
        nameChanged ||
        modsChanged ||
        serversChanged ||
        argsChanged ||
        otherChanged;

      setHasOnlyDownloadedRename(
        !!version.version.downloadedVersion && onlyNameChanged,
      );
      setHasChanges(hasAnyChanges);
    };

    calc();

    return () => {
      cancelled = true;
    };
  }, [
    version,
    versionName,
    mods,
    servers,
    nbtServers,
    runArguments.game,
    runArguments.jvm,
    isLogoChanged,
    quickConnectIp,
    isLoading,
  ]);

  return { hasChanges, setHasChanges, hasOnlyDownloadedRename };
}
