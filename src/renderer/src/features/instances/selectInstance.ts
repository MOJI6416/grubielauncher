import { getDefaultStore } from "jotai";
import { IServerConf } from "@/types/Server";
import { ILocalAccount } from "@/types/Account";
import { Version } from "@renderer/classes/Version";
import {
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  selectedVersionAtom,
  serverAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { isOwner } from "@renderer/utilities/versionPure";
import {
  instanceDiffenceAtom,
  instancePublishDiffAtom,
  instanceSelectionSignatureAtom,
} from "./atoms";
import { instanceSelectionSignature } from "./instanceSelection";
import { loadInstanceContext } from "./openInstance";
import { instanceKey } from "./selectors";

const api = window.api;

let requestId = 0;

export function invalidateInstanceSelection(): void {
  requestId += 1;
  getDefaultStore().set(instanceSelectionSignatureAtom, null);
}

export function clearInstanceSelection(): void {
  invalidateInstanceSelection();

  const store = getDefaultStore();
  store.set(selectedVersionAtom, undefined);
  store.set(isDownloadedVersionAtom, false);
  store.set(isOwnerVersionAtom, false);
  store.set(serverAtom, undefined);
  store.set(versionServersAtom, []);
  store.set(instanceDiffenceAtom, "sync");
  store.set(instancePublishDiffAtom, "");
}

export async function selectInstance(
  instance: Version,
  account?: ILocalAccount | null,
): Promise<void> {
  const reqId = ++requestId;
  const store = getDefaultStore();
  const signature = instanceSelectionSignature(instanceKey(instance), account);
  const isSameInstance =
    store.get(selectedVersionAtom)?.versionPath === instance.versionPath &&
    store.get(instanceSelectionSignatureAtom) === signature;

  if (!isSameInstance) {
    store.set(instanceDiffenceAtom, "sync");
    store.set(instancePublishDiffAtom, "");
  }

  store.set(selectedVersionAtom, instance);
  store.set(isDownloadedVersionAtom, instance.version.downloadedVersion);
  store.set(
    isOwnerVersionAtom,
    isOwner(instance.version.owner, account ?? undefined, instance.version.ownerId),
  );
  store.set(instanceSelectionSignatureAtom, signature);

  void loadInstanceContext(instance);

  try {
    const serverPath = await api.path.join(instance.versionPath, "server");
    const serverConf = await api.path.join(serverPath, "conf.json");
    const hasServer = await api.fs.pathExists(serverPath);

    if (reqId !== requestId) return;

    if (hasServer) {
      const conf = await api.fs.readJSON<IServerConf>(serverConf, "utf-8");
      if (reqId !== requestId) return;
      store.set(serverAtom, conf ?? undefined);
    } else {
      store.set(serverAtom, undefined);
    }
  } catch {
    if (reqId !== requestId) return;

    store.set(serverAtom, undefined);
  }
}
