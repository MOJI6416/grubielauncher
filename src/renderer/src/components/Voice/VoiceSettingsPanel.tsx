import { useState } from "react";
import { useAtom } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AudioLines, Keyboard, Loader2, Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VoicePttBind } from "@/types/Settings";
import { DeviceSelect, MicLevelTest } from "./VoiceDeviceControls";

const api = window.api;

export function VoiceSettingsPanel({
  voicePtt,
  voicePttBind,
  voiceNoiseSuppression,
  isCapturingPtt,
  onVoicePttChange,
  onCapturePttBind,
  onVoiceNoiseSuppressionChange,
}: {
  voicePtt: boolean;
  voicePttBind: VoicePttBind | null;
  voiceNoiseSuppression: boolean;
  isCapturingPtt: boolean;
  onVoicePttChange: (value: boolean) => void;
  onCapturePttBind: () => void;
  onVoiceNoiseSuppressionChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t("settings.voiceDevices")}
        </p>
        <DeviceSelect kind="audioinput" label={t("voice.microphone")} />
        <DeviceSelect kind="audiooutput" label={t("voice.speakers")} />
        <div className="pt-1">
          <MicLevelTest />
        </div>
      </div>

      <div className="space-y-3 border-t pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm">
              <Mic className="size-4 text-muted-foreground" />
              {t("settings.voicePtt")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("settings.voicePttDescription")}
            </p>
          </div>
          <Switch checked={voicePtt} onCheckedChange={onVoicePttChange} />
        </div>

        {voicePtt && (
          <div className="flex items-center justify-between gap-3 pl-6">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Keyboard className="size-3.5" />
              {voicePttBind
                ? voicePttBind.label
                : t("settings.voicePttKeyNone")}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={isCapturingPtt}
              onClick={onCapturePttBind}
            >
              {isCapturingPtt && <Loader2 className="size-4 animate-spin" />}
              {isCapturingPtt
                ? t("settings.voicePttCapturing")
                : t("settings.voicePttCapture")}
            </Button>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm">
              <AudioLines className="size-4 text-muted-foreground" />
              {t("settings.voiceNoiseSuppression")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("settings.voiceNoiseSuppressionDescription")}
            </p>
          </div>
          <Switch
            checked={voiceNoiseSuppression}
            onCheckedChange={onVoiceNoiseSuppressionChange}
          />
        </div>
      </div>
    </div>
  );
}

export function VoiceSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings] = useAtom(settingsAtom);
  const { t } = useTranslation();
  const [isCapturingPtt, setIsCapturingPtt] = useState(false);

  const handleCapturePttBind = async () => {
    setIsCapturingPtt(true);
    try {
      const bind = await api.voice.capturePttBind();
      if (bind) await patchSettings({ voicePttBind: bind });
    } finally {
      setIsCapturingPtt(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("settings.sections.voice")}</DialogTitle>
        </DialogHeader>
        <VoiceSettingsPanel
          voicePtt={settings.voicePtt}
          voicePttBind={settings.voicePttBind}
          voiceNoiseSuppression={settings.voiceNoiseSuppression}
          isCapturingPtt={isCapturingPtt}
          onVoicePttChange={(value) => void patchSettings({ voicePtt: value })}
          onCapturePttBind={() => void handleCapturePttBind()}
          onVoiceNoiseSuppressionChange={(value) =>
            void patchSettings({ voiceNoiseSuppression: value })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
