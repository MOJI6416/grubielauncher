import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Radio, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { isRunningAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { setStreamerMode, useStreamerState } from "./streamerMode";

export function StreamerPill() {
  const { t } = useTranslation();
  const streamer = useStreamerState();
  const isRunning = useAtomValue(isRunningAtom);
  const [open, setOpen] = useState(false);

  if (!streamer.active) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mr-1.5 flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-input hover:text-foreground"
        >
          <Radio className="size-3.5 text-primary" />
          {t("streamer.pill")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3.5" collisionPadding={12}>
        <p className="text-sm font-medium text-foreground">
          {t("streamer.title")}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {streamer.reason === "auto" && streamer.app
            ? t("streamer.reasonAuto", { app: streamer.app })
            : t("streamer.reasonManual")}
        </p>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {t("streamer.hides")}
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setOpen(false);
              void setStreamerMode(false);
            }}
          >
            {t("streamer.turnOff")}
          </Button>
          <Button
            variant="ghost"
            disabled={isRunning}
            onClick={() => {
              setOpen(false);
              navigate({ name: "settings", section: "privacy" });
            }}
          >
            <Settings />
            {t("streamer.settings")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
