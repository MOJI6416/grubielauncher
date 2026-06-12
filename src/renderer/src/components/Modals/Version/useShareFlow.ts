import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IModpack } from "@/types/Backend";
import { IServer } from "@/types/ServersList";
import { TSettings } from "@/types/Settings";
import { Version } from "@renderer/classes/Version";
import { ILocalAccount } from "@/types/Account";
import { VersionDiffence } from "@renderer/components/Versions";
import {
  applyBlockedModFilePaths,
  checkBlockedMods,
  IBlockedMod,
} from "../BlockedMods";
import {
  checkDiffenceUpdateData,
  syncShare,
} from "@renderer/utilities/version";

const api = window.api;

export type EditVersionLoadingType =
  | "save"
  | "check_diff"
  | "sync"
  | "server"
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
  setLoadingType: (value: EditVersionLoadingType | undefined) => void;
  setBlockedMods: (mods: IBlockedMod[]) => void;
  setIsBlockedMods: (value: boolean) => void;
  setBlockedCloseType: (value: "save" | "check" | "sync" | undefined) => void;
}) {
  const { t } = useTranslation();

  const [isOpenShareModal, setIsOpenModalShare] = useState(false);
  const [shareType, setShareType] = useState<"new" | "update">("new");
  const [isShareModal, setShareModal] = useState(false);
  const [versionDiffence, setVersionDiffence] =
    useState<VersionDiffence>("sync");
  const [diffenceUpdateData, setDiffenceUpdateData] = useState<string>("");
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
      const missingBlockedMods = await checkBlockedMods(
        modpack.conf.loader.mods,
        version.versionPath,
      );

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
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("versions.updateError"), { description: message });
    } finally {
      setLoadingType(undefined);
      setIsLoading(false);
    }
  }

  async function openShareManagement() {
    if (!version || !account || !version.version.shareCode) return;

    try {
      setIsLoading(true);
      setLoadingType("check_diff");

      const modpackData = await api.backend.getModpack(
        account.accessToken!,
        version.version.shareCode,
      );

      if (!modpackData.data) throw new Error("not found modpack");

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
        modpackData.data,
      );

      setDiffenceUpdateData(diff);
      setVersionDiffence(diff ? "new" : "sync");

      setTempModpack(modpackData.data);
      setShareType("update");
      setShareModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("versions.updateError"), { description: message });
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
  };
}
