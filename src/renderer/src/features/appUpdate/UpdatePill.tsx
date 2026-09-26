import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  consolesMetaAtom,
  installActiveAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";
import { isVoiceLive } from "@renderer/features/voice/roomModel";
import { showFailureToast } from "@renderer/utilities/failures";
import { appUpdateAtom, readyVersion, updateBlock } from "./appUpdate";

const api = window.api;

export function UpdatePill() {
  const { t } = useTranslation();
  const state = useAtomValue(appUpdateAtom);
  const consoles = useAtomValue(consolesMetaAtom);
  const isInstallActive = useAtomValue(installActiveAtom);
  const voice = useAtomValue(voiceSessionMetaAtom);
  const [isInstalling, setIsInstalling] = useState(false);

  const version = readyVersion(state);
  if (!version) return null;

  const block = updateBlock({
    isGameRunning: consoles.some((console) => console.status === "running"),
    isInstallActive,
  });
  const inCall = isVoiceLive(voice.state);

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mr-1.5 flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-primary-soft px-2 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-primary-soft-raised"
        >
          <ArrowUpCircle className="size-3.5 text-primary" />
          {t("appUpdate.pill", { version })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3.5" collisionPadding={12}>
        <p className="text-sm font-medium text-foreground">
          {t("appUpdate.title", { version })}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {t("appUpdate.description")}
        </p>
        {(block || inCall) && (
          <p className="mt-2 text-xs leading-snug text-warning">
            {block ? t(`appUpdate.blocked.${block}`) : t("appUpdate.callWarning")}
          </p>
        )}
        <Button
          className="mt-3 w-full"
          disabled={Boolean(block) || isInstalling}
          onClick={() => void install()}
        >
          {isInstalling ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ArrowUpCircle />
          )}
          {t("appUpdate.install")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
