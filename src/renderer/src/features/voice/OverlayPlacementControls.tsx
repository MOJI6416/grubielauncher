import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TSettings } from "@/types/Settings";
import {
  HIDDEN_VOICE_OVERLAY,
  OVERLAY_CORNERS,
  type OverlayCorner,
  type OverlayDisplay,
} from "@/types/Voice";
import {
  accountAtom,
  consolesMetaAtom,
  voiceSessionAtom,
} from "@renderer/stores/atoms";
import { participantInitials } from "./participants";
import { isVoiceLive } from "./roomModel";

const api = window.api;
const PREVIEW_MS = 4000;

const CORNER_CELL: Record<OverlayCorner, string> = {
  "top-left": "items-start justify-start",
  "top-right": "items-start justify-end",
  "bottom-left": "items-end justify-start",
  "bottom-right": "items-end justify-end",
};

function displayName(
  display: OverlayDisplay,
  index: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const name = display.label || t("settings.voiceOverlayScreen", { index: index + 1 });
  return `${name} · ${display.width}×${display.height}`;
}

export function OverlayPlacementControls({
  settings,
  commit,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
}) {
  const { t } = useTranslation();
  const account = useAtomValue(accountAtom);
  const session = useAtomValue(voiceSessionAtom);
  const consoles = useAtomValue(consolesMetaAtom);
  const [displays, setDisplays] = useState<OverlayDisplay[]>([]);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRealOverlayActive =
    isVoiceLive(session.state) &&
    consoles.some((meta) => meta.status === "running");

  useEffect(() => {
    let isActive = true;
    void api.voice.overlayDisplays().then((list) => {
      if (isActive) setDisplays(list);
    });
    return () => {
      isActive = false;
      if (previewTimer.current) {
        clearTimeout(previewTimer.current);
        void api.voice.updateOverlay(HIDDEN_VOICE_OVERLAY);
      }
    };
  }, []);

  const placement = {
    corner: settings.voiceOverlayCorner,
    displayId: settings.voiceOverlayDisplay,
  };

  const preview = () => {
    const name = account?.nickname || "Grubie";
    void api.voice.updateOverlay({
      visible: true,
      speakers: [
        {
          id: "preview",
          name,
          initials: participantInitials(name),
          headUrl: null,
          isLocal: true,
        },
      ],
      ...placement,
    });
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      previewTimer.current = null;
      void api.voice.updateOverlay(HIDDEN_VOICE_OVERLAY);
    }, PREVIEW_MS);
  };

  const knownDisplay = displays.some(
    (display) => display.id === settings.voiceOverlayDisplay,
  );

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-label={t("settings.voiceOverlayCorner")}
        className="grid h-12 w-20 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 rounded-md border border-border bg-surface-1 p-0.5"
      >
        {OVERLAY_CORNERS.map((corner) => {
          const isActive = settings.voiceOverlayCorner === corner;
          return (
            <button
              key={corner}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={t(`settings.voiceOverlayCorners.${corner}`)}
              onClick={() => commit({ voiceOverlayCorner: corner })}
              className={cn(
                "flex rounded-sm p-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                CORNER_CELL[corner],
                isActive ? "bg-primary-soft" : "hover:bg-surface-3",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-3 rounded-full",
                  isActive ? "bg-primary" : "bg-faint/50",
                )}
              />
            </button>
          );
        })}
      </div>

      <span className="text-xs text-muted-foreground">
        {t(`settings.voiceOverlayCorners.${settings.voiceOverlayCorner}`)}
      </span>

      {displays.length > 1 && (
        <Select
          value={String(knownDisplay ? settings.voiceOverlayDisplay : 0)}
          onValueChange={(value) =>
            value !== null && commit({ voiceOverlayDisplay: Number(value) })
          }
        >
          <SelectTrigger size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{t("settings.voiceOverlayPrimary")}</SelectItem>
            {displays.map((display, index) => (
              <SelectItem key={display.id} value={String(display.id)}>
                {displayName(display, index, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        variant="secondary"
        size="sm"
        className="ml-auto"
        disabled={isRealOverlayActive}
        onClick={preview}
      >
        <Eye />
        {t("settings.voiceOverlayPreview")}
      </Button>
    </div>
  );
}
