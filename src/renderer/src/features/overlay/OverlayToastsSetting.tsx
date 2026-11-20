import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Keyboard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@renderer/components/Hint";
import { HIDDEN_VOICE_OVERLAY } from "@/types/Voice";
import type { TSettings } from "@/types/Settings";
import { SettingRow } from "@renderer/features/settings/SettingsPrimitives";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;
const PREVIEW_MS = 5000;

export function OverlayToastsSetting({
  settings,
  commit,
  query,
  changed,
  onReset,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
  query: string;
  changed: boolean;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [isCapturing, setCapturing] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bind = settings.overlayAcceptBind;

  useEffect(
    () => () => {
      if (!previewTimer.current) return;
      clearTimeout(previewTimer.current);
      void api.voice.updateOverlay(HIDDEN_VOICE_OVERLAY).catch(ignoreFailure);
    },
    [],
  );

  const capture = async () => {
    setCapturing(true);
    try {
      const result = await api.voice.capturePttBind();
      if (result?.bind) {
        commit({ overlayAcceptBind: result.bind });
        return;
      }
      if (result?.reason === "permission") {
        toast.error(t("voice.pttPermission"), {
          description: t("voice.pttPermissionHint"),
          duration: 15000,
          action: {
            label: t("voice.micOpenSettings"),
            onClick: () => void api.os.openPrivacySettings("accessibility"),
          },
        });
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

  const preview = () => {
    void api.voice
      .updateOverlay({
        visible: true,
        speakers: [],
        toasts: [
          {
            id: "preview",
            kind: "invite",
            title: "Grubie",
            body: t("overlay.previewBody"),
            initials: "GR",
            headUrl: null,
            action: bind ? t("overlay.acceptHint", { key: bind.label }) : null,
          },
        ],
        corner: settings.voiceOverlayCorner,
        displayId: settings.voiceOverlayDisplay,
      })
      .catch(ignoreFailure);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      void api.voice.updateOverlay(HIDDEN_VOICE_OVERLAY).catch(ignoreFailure);
    }, PREVIEW_MS);
  };

  return (
    <SettingRow
      htmlFor="settings-overlay-toasts"
      title={t("settings.overlayToasts")}
      description={t("settings.overlayToastsDescription")}
      query={query}
      changed={changed}
      onReset={onReset}
      control={
        <Switch
          id="settings-overlay-toasts"
          checked={settings.overlayToasts}
          onCheckedChange={(value) => commit({ overlayToasts: value })}
        />
      }
    >
      {settings.overlayToasts && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-2.5 py-2">
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <Keyboard className="size-3.5 shrink-0 text-faint" />
            <span className="shrink-0 text-muted-foreground">
              {t("settings.overlayAcceptKey")}
            </span>
            <Hint
              content={bind ? bind.label : t("settings.voicePttKeyNone")}
              variant="text"
              truncatedOnly
            >
              <span
                className={
                  bind
                    ? "truncate font-mono text-foreground"
                    : "truncate text-muted-foreground"
                }
              >
                {bind ? bind.label : t("settings.voicePttKeyNone")}
              </span>
            </Hint>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={preview}>
              <Eye className="size-3.5" />
              {t("settings.voiceOverlayPreview")}
            </Button>
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
          </span>
        </div>
      )}
    </SettingRow>
  );
}
