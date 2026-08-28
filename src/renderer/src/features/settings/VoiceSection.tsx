import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DeviceSelect,
  MicLevelTest,
  SpeakerTest,
} from "@renderer/components/Voice/VoiceDeviceControls";
import type { TSettings } from "@/types/Settings";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

const api = window.api;

export function VoiceSection({
  settings,
  commit,
  visible,
  query,
  isChanged,
  reset,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
  isChanged: (id: SettingsEntryId) => boolean;
  reset: (id: SettingsEntryId) => void;
}) {
  const { t } = useTranslation();
  const [isCapturing, setCapturing] = useState(false);

  const capture = async () => {
    setCapturing(true);
    try {
      const result = await api.voice.capturePttBind();
      if (result?.bind) {
        commit({ voicePttBind: result.bind });
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
    <SettingsGroup title={t("settings.sections.voice")}>
      {visible("voiceDevices") && (
        <SettingRow
          title={t("settings.voiceDevices")}
          description={t("settings.voice.devicesDescription")}
          query={query}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-faint">{t("voice.microphone")}</p>
              <DeviceSelect kind="audioinput" label={t("voice.microphone")} />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-faint">{t("voice.speakers")}</p>
              <DeviceSelect kind="audiooutput" label={t("voice.speakers")} />
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <MicLevelTest />
            <SpeakerTest />
          </div>
        </SettingRow>
      )}

      {visible("voicePtt") && (
        <SettingRow
          htmlFor="settings-voice-ptt"
          title={t("settings.voicePtt")}
          description={t("settings.voicePttDescription")}
          query={query}
          changed={isChanged("voicePtt")}
          onReset={() => reset("voicePtt")}
          control={
            <Switch
              id="settings-voice-ptt"
              checked={settings.voicePtt}
              onCheckedChange={(value) => commit({ voicePtt: value })}
            />
          }
        >
          {settings.voicePtt && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-2.5 py-2">
              <span className="flex min-w-0 items-center gap-2 text-xs">
                <Keyboard className="size-3.5 shrink-0 text-faint" />
                <span
                  className={
                    settings.voicePttBind
                      ? "truncate font-mono text-foreground"
                      : "truncate text-warning"
                  }
                >
                  {settings.voicePttBind
                    ? settings.voicePttBind.label
                    : t("settings.voicePttKeyNone")}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={isCapturing}
                onClick={() => void capture()}
              >
                {isCapturing && <Loader2 className="size-3.5 animate-spin" />}
                {isCapturing
                  ? t("settings.voicePttCapturing")
                  : t("settings.voicePttCapture")}
              </Button>
            </div>
          )}
        </SettingRow>
      )}

      {visible("voiceNoiseSuppression") && (
        <SettingRow
          htmlFor="settings-voice-rnnoise"
          title={t("settings.voiceNoiseSuppression")}
          description={t("settings.voiceNoiseSuppressionDescription")}
          query={query}
          changed={isChanged("voiceNoiseSuppression")}
          onReset={() => reset("voiceNoiseSuppression")}
          control={
            <Switch
              id="settings-voice-rnnoise"
              checked={settings.voiceNoiseSuppression}
              onCheckedChange={(value) =>
                commit({ voiceNoiseSuppression: value })
              }
            />
          }
        />
      )}
    </SettingsGroup>
  );
}
