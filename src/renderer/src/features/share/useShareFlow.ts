import { useState } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IModpack } from "@/types/Backend";
import { IServer } from "@/types/ServersList";
import { TSettings } from "@/types/Settings";
import { Version } from "@renderer/classes/Version";
import { ILocalAccount } from "@/types/Account";
import {
  instanceDiffenceAtom,
  instancePublishDiffAtom,
} from "@renderer/features/instances/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  applyBlockedModFilePaths,
  checkBlockedMods,
  IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { classifyModpackFetch } from "@renderer/utilities/shareSyncPure";
import {
  checkDiffenceUpdateData,
  reportShareSyncInterruption,
  syncShare,
} from "@renderer/utilities/version";

const api = window.api;

export type InstanceLoadingType =
  | "save"
  | "check_diff"
  | "sync"
  | "server"
  | "shortcut"
  | "check";

export function useShareFlow({
  version,
  account,
  servers,
  settings,
  minecraftPath,
  image,
  quickConnectIp,
  closeModal,
  setIsLoading,
  setLoadingType,
  setBlockedMods,
  setIsBlockedMods,
  setBlockedCloseType,
}: {
  version: Version | undefined;
  account: ILocalAccount | undefined;
  servers: IServer[];
  settings: TSettings;
  minecraftPath: string;
  image: string;
  quickConnectIp: string | undefined;
  closeModal: () => void;
  setIsLoading: (value: boolean) => void;
  setLoadingType: (value: InstanceLoadingType | undefined) => void;
  setBlockedMods: (mods: IBlockedMod[]) => void;
  setIsBlockedMods: (value: boolean) => void;
  setBlockedCloseType: (value: "save" | "check" | "sync" | undefined) => void;
}) {
  const { t } = useTranslation();

  const [isOpenShareModal, setIsOpenModalShare] = useState(false);
  const [shareType, setShareType] = useState<"new" | "update">("new");
  const [isShareModal, setShareModal] = useState(false);
  const [versionDiffence, setVersionDiffence] = useAtom(instanceDiffenceAtom);
  const [diffenceUpdateData, setDiffenceUpdateData] = useAtom(
    instancePublishDiffAtom,
  );
  const [tempModpack, setTempModpack] = useState<IModpack>();
  const [syncModpack, setSyncModpack] = useState<IModpack>();

  async function sync(
    resolvedBlockedMods: IBlockedMod[] = [],
    preparedModpack?: IModpack,
  ) {
    if (!version || !account || !version.version.shareCode) return;

    setLoadingType("sync");
    setIsLoading(true);

    try {
      const modpack =
        preparedModpack ||
        (
          await api.backend.getModpack(
            account.accessToken || "",
            version.version.shareCode,
          )
        ).data;

      if (!modpack) throw new Error("not share version");

      const hasBlockedPaths = applyBlockedModFilePaths(
        modpack.conf.loader.mods,
        resolvedBlockedMods,
      );
      const { blockedMods: missingBlockedMods, mods: resolvedMods } =
        await checkBlockedMods(modpack.conf.loader.mods, version.versionPath);
      modpack.conf.loader.mods = resolvedMods;

      if (missingBlockedMods.length > 0) {
        setBlockedMods(missingBlockedMods);
        setSyncModpack(modpack);
        setBlockedCloseType("sync");
        setIsBlockedMods(true);
        return;
      }

      if (hasBlockedPaths) setBlockedMods([]);

      await syncShare(
        version,
        servers,
        settings,
        account.accessToken || "",
        modpack,
      );

      toast.success(t("versions.updated"));

      closeModal();
    } catch (error) {
      if (!reportShareSyncInterruption(error)) {
        showFailureToast(t("versions.updateError"), error, {
          channels: [
            "version:save",
            "servers:write",
            "fs:",
            "backend:getModpack",
          ],
        });
      }
    } finally {
      setLoadingType(undefined);
      setIsLoading(false);
    }
  }

  async function loadPublishDiff() {
    if (!version || !account || !version.version.shareCode) return null;

    const modpackData = await api.backend.getModpack(
      account.accessToken!,
      version.version.shareCode,
    );

    const outcome = classifyModpackFetch(modpackData);
    if (outcome !== "ok" || !modpackData.data) throw new Error(outcome);

    const modpack = modpackData.data;

    const diff = await checkDiffenceUpdateData(
      {
        mods: version.version.loader.mods,
        runArguments: version.version.runArguments || {
          game: "",
          jvm: "",
        },
        servers,
        version: version.version,
        versionPath: await api.path.join(
          minecraftPath,
          "versions",
          version.version.name,
        ),
        logo: version.version.image || image || "",
        quickServer: quickConnectIp,
      },
      account.accessToken || "",
      modpack,
    );

    setDiffenceUpdateData(version.version.downloadedVersion ? "" : diff);

    return { diff, modpack };
  }

  async function refreshPublishDiff() {
    if (!version?.version.shareCode || version.version.downloadedVersion)
      return;

    try {
      await loadPublishDiff();
    } catch {}
  }

  async function openShareManagement() {
    if (!version || !account || !version.version.shareCode) return;

    try {
      setIsLoading(true);
      setLoadingType("check_diff");

      const loaded = await loadPublishDiff();
      if (!loaded) return;

      setTempModpack(loaded.modpack);
      setShareType("update");
      setShareModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "gone") {
        showFailureToast(t("versions.updateError"), undefined, {
          channels: ["backend:getModpack"],
          fallbackDescription: t("versions.modpackGoneHint"),
        });
      } else if (message === "unavailable") {
        showFailureToast(t("versions.updateError"), undefined, {
          channels: ["backend:getModpack"],
          fallbackDescription: t("versions.modpackUnavailableHint"),
        });
      } else {
        showFailureToast(t("versions.updateError"), error);
      }
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  return {
    isOpenShareModal,
    setIsOpenModalShare,
    shareType,
    setShareType,
    isShareModal,
    setShareModal,
    versionDiffence,
    setVersionDiffence,
    diffenceUpdateData,
    setDiffenceUpdateData,
    tempModpack,
    setTempModpack,
    syncModpack,
    setSyncModpack,
    sync,
    openShareManagement,
    refreshPublishDiff,
  };
}
