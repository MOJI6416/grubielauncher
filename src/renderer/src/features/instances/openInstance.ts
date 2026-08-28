import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import { IServer } from "@/types/ServersList";
import { ILocalAccount, IAuth } from "@/types/Account";
import { Version } from "@renderer/classes/Version";
import i18n from "@renderer/i18n";
import {
  accountAtom,
  authDataAtom,
  isDownloadedVersionAtom,
  networkAtom,
  selectedVersionAtom,
  versionServersAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { isOwner } from "@renderer/utilities/versionPure";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { checkDiffenceUpdateData } from "@renderer/utilities/version";
import {
  VersionDiffence,
  instanceDiffenceAtom,
  instancePublishDiffAtom,
} from "./atoms";
import { readInstanceServers } from "./instanceServers";
import { instanceKey } from "./selectors";
import {
  forgetInstanceUpdates,
  recordModpackComparison,
} from "./updateCheck";

const api = window.api;

interface InstanceContext {
  ownerOk: boolean;
  account?: ILocalAccount | null;
  authData?: IAuth | null;
  isNetwork: boolean;
}

function accountLane(account?: ILocalAccount | null): string {
  return account ? accountIdentity(account) : "";
}

function isStillSelected(instance: Version): boolean {
  const selected = getDefaultStore().get(selectedVersionAtom);

  return selected?.versionPath === instance.versionPath;
}

function isCurrentContext(
  instance: Version,
  context: InstanceContext,
): boolean {
  if (!isStillSelected(instance)) return false;

  return (
    accountLane(getDefaultStore().get(accountAtom)) ===
    accountLane(context.account)
  );
}

async function readServers(instance: Version): Promise<IServer[]> {
  const store = getDefaultStore();
  const servers = (await readInstanceServers(instance.versionPath)) ?? [];

  if (isStillSelected(instance)) store.set(versionServersAtom, servers);

  return servers;
}

async function resolveDiffence(
  instance: Version,
  servers: IServer[],
  context: InstanceContext,
): Promise<VersionDiffence | null> {
  const shareCode = instance.version.shareCode;
  if (!shareCode || !context.ownerOk || !context.isNetwork) return null;

  const store = getDefaultStore();
  const token = context.account?.accessToken || "";
  const modpackData = await api.backend.getModpack(token, shareCode);
  if (!isCurrentContext(instance, context)) return null;

  if (modpackData.status === "not_found") {
    instance.version.shareCode = undefined;
    instance.version.downloadedVersion = false;
    await instance.save();
    store.set(isDownloadedVersionAtom, false);
    store.set(versionsAtom, (previous) => [...previous]);
    forgetInstanceUpdates(instanceKey(instance));

    toast.warning(
      i18n.t("versions.shareGone", { name: instance.version.name }),
      {
        id: `share-gone-${shareCode}`,
        description: i18n.t("versions.shareGoneHint"),
      },
    );

    return null;
  }

  const modpack = modpackData.data;
  if (!modpack) return null;

  recordModpackComparison(instanceKey(instance), instance.version, modpack);

  if (
    instance.version.downloadedVersion &&
    context.authData?.sub &&
    context.authData.sub === String(modpack.owner?._id ?? "")
  ) {
    instance.version.downloadedVersion = false;
    await instance.save();
    store.set(isDownloadedVersionAtom, false);
    store.set(versionsAtom, (previous) => [...previous]);
  }

  const diff = await checkDiffenceUpdateData(
    {
      mods: instance.version.loader.mods,
      runArguments: instance.version.runArguments || { game: "", jvm: "" },
      servers,
      version: instance.version,
      versionPath: instance.versionPath,
      logo: instance.version.image || "",
      quickServer: instance.version.quickServer || "",
    },
    token,
    modpack,
  );

  if (isCurrentContext(instance, context)) {
    store.set(
      instancePublishDiffAtom,
      instance.version.downloadedVersion ? "" : diff,
    );
  }

  if (modpack.build) {
    if (
      instance.version.downloadedVersion &&
      modpack.build < instance.version.build
    ) {
      return "new";
    }
    if (modpack.build > instance.version.build) return "old";
  }

  if (!diff) return "sync";

  return instance.version.downloadedVersion ? "sync" : "new";
}

const running = new Map<string, Promise<void>>();

export function loadInstanceContext(instance: Version): Promise<void> {
  const account = getDefaultStore().get(accountAtom);
  const lane = `${account ? accountIdentity(account) : ""}|${instance.versionPath}`;

  const pending = running.get(lane);
  if (pending) return pending;

  const task = readInstanceContext(instance, account).finally(() => {
    if (running.get(lane) === task) running.delete(lane);
  });

  running.set(lane, task);

  return task;
}

async function readInstanceContext(
  instance: Version,
  account: ILocalAccount | undefined,
): Promise<void> {
  const store = getDefaultStore();
  const context: InstanceContext = {
    ownerOk: isOwner(instance.version.owner, account),
    account,
    authData: store.get(authDataAtom),
    isNetwork: store.get(networkAtom),
  };

  try {
    const servers = await readServers(instance);
    const diffence = await resolveDiffence(instance, servers, context);

    if (isCurrentContext(instance, context)) {
      store.set(instanceDiffenceAtom, diffence ?? "sync");
    }
  } catch {}
}
