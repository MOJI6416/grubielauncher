import { IArguments } from "@/types/IArguments";
import { ILocalProject } from "@/types/ModManager";
import { IServer } from "@/types/ServersList";
import type { InstanceSettingsOverrides } from "@/shared/instanceSettings";

export interface StoredInstanceConf {
  loader: { mods?: ILocalProject[] };
  lastUpdate: Date;
  overrides?: InstanceSettingsOverrides;
  runArguments: IArguments;
  image: string;
  quickServer?: string;
}

export interface InstanceConfSnapshot {
  mods?: ILocalProject[];
  lastUpdate: Date;
  overrides?: InstanceSettingsOverrides;
  runArguments: IArguments;
  image: string;
  quickServer?: string;
}

export function snapshotInstanceConf(
  conf: StoredInstanceConf,
): InstanceConfSnapshot {
  return {
    mods: conf.loader.mods,
    lastUpdate: conf.lastUpdate,
    overrides: conf.overrides,
    runArguments: conf.runArguments,
    image: conf.image,
    quickServer: conf.quickServer,
  };
}

export function restoreInstanceConf(
  conf: StoredInstanceConf,
  snapshot: InstanceConfSnapshot,
): void {
  conf.loader.mods = snapshot.mods;
  conf.lastUpdate = snapshot.lastUpdate;
  conf.overrides = snapshot.overrides;
  conf.runArguments = snapshot.runArguments;
  conf.image = snapshot.image;
  conf.quickServer = snapshot.quickServer;
}

export function repointLocalImage(
  image: string | undefined,
  oldPath: string,
  newPath: string,
): string | null {
  if (!image || !image.startsWith("file://")) return null;
  if (!oldPath || !newPath) return null;

  const variants: [string, string][] = [
    [oldPath, newPath],
    [oldPath.replace(/\\/g, "/"), newPath.replace(/\\/g, "/")],
    [
      encodeURI(oldPath.replace(/\\/g, "/")),
      encodeURI(newPath.replace(/\\/g, "/")),
    ],
  ];

  const match = variants.find(([from]) => from && image.includes(from));
  if (!match) return null;

  return image.replace(match[0], match[1]);
}

export function isRenameRequested(
  draftName: string,
  currentName: string,
): boolean {
  return draftName.trim() !== currentName;
}

export function haveArgumentsChanged(
  draft: IArguments,
  current: IArguments | undefined,
): boolean {
  return (
    draft.game !== (current?.game || "") || draft.jvm !== (current?.jvm || "")
  );
}

export function hasQuickServerChanged(
  draft: string | undefined,
  current: string | undefined,
): boolean {
  return (draft ?? "").trim() !== (current ?? "").trim();
}

function serverAddressKey(ip?: string): string {
  return (ip ?? "").trim().toLowerCase();
}

export function mergeExternalServers(
  draft: IServer[],
  stored: IServer[] | null,
  snapshot: IServer[],
): IServer[] {
  if (!stored) return draft;

  const known = new Set(snapshot.map((server) => serverAddressKey(server.ip)));
  const onDisk = new Set(stored.map((server) => serverAddressKey(server.ip)));

  const survived = draft.filter((server) => {
    const key = serverAddressKey(server.ip);
    return !key || !known.has(key) || onDisk.has(key);
  });

  const kept = new Set(survived.map((server) => serverAddressKey(server.ip)));

  const external = stored.filter((server) => {
    const key = serverAddressKey(server.ip);
    return !!key && !known.has(key) && !kept.has(key);
  });

  if (survived.length === draft.length && external.length === 0) return draft;

  return [...survived, ...external];
}

export function shouldOfferPublish({
  changed,
  shareCode,
  isDownloadedVersion,
  isNetwork,
  isVersionRunning,
}: {
  changed: boolean;
  shareCode: string | undefined;
  isDownloadedVersion: boolean;
  isNetwork: boolean;
  isVersionRunning: boolean;
}): boolean {
  return (
    changed &&
    !!shareCode &&
    !isDownloadedVersion &&
    isNetwork &&
    !isVersionRunning
  );
}
