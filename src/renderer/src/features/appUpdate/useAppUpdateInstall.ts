import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  consolesMetaAtom,
  installActiveAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";
import { isVoiceLive } from "@renderer/features/voice/roomModel";
import { showFailureToast } from "@renderer/utilities/failures";
import { appUpdateAtom, readyVersion, updateBlock } from "./appUpdate";

const api = window.api;

export function useAppUpdateInstall() {
  const { t } = useTranslation();
  const state = useAtomValue(appUpdateAtom);
  const consoles = useAtomValue(consolesMetaAtom);
  const isInstallActive = useAtomValue(installActiveAtom);
  const voice = useAtomValue(voiceSessionMetaAtom);
  const [isInstalling, setIsInstalling] = useState(false);

  const block = updateBlock({
    isGameRunning: consoles.some((console) => console.status === "running"),
    isInstallActive,
  });

  const install = async () => {
    setIsInstalling(true);
    try {
      if (!(await api.appUpdate.install())) throw new Error("update refused");
    } catch (error) {
      setIsInstalling(false);
      showFailureToast(t("appUpdate.failed"), error, {
        channels: ["appUpdate:install"],
      });
    }
  };

  return {
    state,
    version: readyVersion(state),
    block,
    inCall: isVoiceLive(voice.state),
    isInstalling,
    install,
  };
}
