import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { AudioLines, Keyboard, Loader2, Mic, Speaker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { TSettings } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { toast } from "sonner";
import { showFailureToast } from "@renderer/utilities/failures";
import { DeviceSelect, MicLevelTest, SpeakerTest } from "./VoiceDeviceControls";

const api = window.api;

function Row({
  icon,
  title,
  description,
  control,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px]">
            <span className="text-faint">{icon}</span>
            {title}
          </p>
          {description && (
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <span className="shrink-0">{control}</span>
      </div>
      {children}
    </div>
  );
}

export function VoiceAudioPanel() {
  const settings = useAtomValue(settingsAtom);
  const { t } = useTranslation();
  const [isCapturing, setCapturing] = useState(false);

  const save = (patch: Partial<TSettings>) => {
    void patchSettings(patch).catch((error) => {
      showFailureToast(t("settings.saveFailed"), error, {
        channels: ["settings:", "fs:"],
      });
    });
  };

  const capture = async () => {
    setCapturing(true);
    try {
      const result = await api.voice.capturePttBind();
      if (result?.bind) {
        save({ voicePttBind: result.bind });
        return;
      }
      if (result?.reason === "unavailable") {
        toast.error(t("voice.pttUnavailable"), {
          description: t("settings.voicePttCaptureUnavailable"),
          duration: 8000,
        });
        return;
      }
      if (result?.reason === "timeout") {
        toast.warning(t("settings.voicePttCaptureTimeout"));
      }
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-faint uppercase">
          <Mic className="size-3" />
          {t("voice.microphone")}
        </p>
        <DeviceSelect kind="audioinput" label={t("voice.microphone")} />
        <MicLevelTest />
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-faint uppercase">
          <Speaker className="size-3" />
          {t("voice.speakers")}
        </p>
        <DeviceSelect kind="audiooutput" label={t("voice.speakers")} />
        <SpeakerTest />
      </div>

      <div className="space-y-3 border-t border-border pt-3">
        <Row
          icon={<Keyboard className="size-3.5" />}
          title={t("settings.voicePtt")}
          description={t("settings.voicePttDescription")}
          control={
            <Switch
              checked={settings.voicePtt}
              onCheckedChange={(value) => save({ voicePtt: value })}
              aria-label={t("settings.voicePtt")}
            />
          }
        >
          {settings.voicePtt && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
              <span
                className={cn(
                  "min-w-0 truncate font-mono text-[11px]",
                  settings.voicePttBind ? "text-foreground" : "text-warning",
                )}
              >
                {settings.voicePttBind
                  ? settings.voicePttBind.label
                  : t("settings.voicePttKeyNone")}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={isCapturing}
                onClick={() => void capture()}
              >
                {isCapturing && <Loader2 className="size-3 animate-spin" />}
                {isCapturing
                  ? t("settings.voicePttCapturing")
                  : t("settings.voicePttCapture")}
              </Button>
            </div>
          )}
        </Row>

        <Row
          icon={<AudioLines className="size-3.5" />}
          title={t("settings.voiceNoiseSuppression")}
          description={t("settings.voiceNoiseSuppressionDescription")}
          control={
            <Switch
              checked={settings.voiceNoiseSuppression}
              onCheckedChange={(value) =>
                save({ voiceNoiseSuppression: value })
              }
              aria-label={t("settings.voiceNoiseSuppression")}
            />
          }
        />
      </div>
    </div>
  );
}
