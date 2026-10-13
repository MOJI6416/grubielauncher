import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { formatMonthDay } from "./calendar";
import { PixelSprite } from "./SeasonalDecor";
import { PUMPKIN } from "./sprites";
import { releaseBats, seasonalEventAtom } from "./seasonalStore";

export function SeasonalPill() {
  const { t, i18n } = useTranslation();
  const event = useAtomValue(seasonalEventAtom);
  const [open, setOpen] = useState(false);

  if (event?.id !== "halloween") return null;

  const title = event.isPeak
    ? t("seasonal.halloween.peakTitle")
    : t("seasonal.halloween.title");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("seasonal.halloween.title")}
          onClick={() => {
            if (!open) releaseBats();
          }}
          className="halloween-pill mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 transition-colors hover:border-input"
          data-peak={event.isPeak}
        >
          <PixelSprite sprite={PUMPKIN} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3.5" collisionPadding={12}>
        <div className="flex items-start gap-3">
          <PixelSprite
            sprite={PUMPKIN}
            scale={3}
            className="halloween-pumpkin-glow shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {t("seasonal.halloween.description", {
                end: formatMonthDay(event.endsOn, i18n.language),
              })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            setOpen(false);
            void patchSettings({ seasonalDecor: false });
          }}
        >
          {t("seasonal.turnOff")}
        </Button>
        <p className="mt-2 text-center text-xs text-faint">
          {t("seasonal.turnOffHint")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
