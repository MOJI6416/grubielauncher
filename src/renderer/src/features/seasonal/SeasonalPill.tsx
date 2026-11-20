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
import { formatMonthDay, type SeasonalEventId } from "./calendar";
import { PixelSprite } from "./SeasonalDecor";
import { FIR_TREE, PUMPKIN, type Sprite } from "./sprites";
import { releaseBats, seasonalEventAtom } from "./seasonalStore";

const PILLS: Record<
  SeasonalEventId,
  {
    sprite: Sprite;
    pillClassName: string;
    glowClassName: string;
    onOpen?: () => void;
  }
> = {
  halloween: {
    sprite: PUMPKIN,
    pillClassName: "halloween-pill",
    glowClassName: "halloween-pumpkin-glow",
    onOpen: releaseBats,
  },
  winter: {
    sprite: FIR_TREE,
    pillClassName: "winter-pill",
    glowClassName: "winter-tree-glow",
  },
};

export function SeasonalPill() {
  const { t, i18n } = useTranslation();
  const event = useAtomValue(seasonalEventAtom);
  const [open, setOpen] = useState(false);

  if (!event) return null;

  const pill = PILLS[event.id];
  const title = event.isPeak
    ? t(`seasonal.${event.id}.peakTitle`)
    : t(`seasonal.${event.id}.title`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t(`seasonal.${event.id}.title`)}
          onClick={() => {
            if (!open) pill.onOpen?.();
          }}
          className={`${pill.pillClassName} mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 transition-colors hover:border-input`}
          data-peak={event.isPeak}
        >
          <PixelSprite sprite={pill.sprite} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3.5" collisionPadding={12}>
        <div className="flex items-start gap-3">
          <PixelSprite
            sprite={pill.sprite}
            scale={3}
            className={`${pill.glowClassName} shrink-0`}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {t(`seasonal.${event.id}.description`, {
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
