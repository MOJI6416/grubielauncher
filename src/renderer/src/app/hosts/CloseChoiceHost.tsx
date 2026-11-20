import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

type CloseChoice = "tray" | "quit";

export function CloseChoiceHost() {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<CloseChoice | null>(null);

  useEffect(
    () =>
      api.other.onCloseChoiceRequested(() => {
        setRemember(true);
        setOpen(true);
      }),
    [],
  );

  const choose = async (choice: CloseChoice) => {
    if (busy) return;
    setBusy(choice);
    countFeature(choice === "tray" ? "closeChoice.tray" : "closeChoice.quit");
    try {
      if (remember) {
        await patchSettings({ closeToTray: choice === "tray" }).catch((error) =>
          showFailureToast(t("settings.saveFailed"), error, {
            channels: ["fs:writeJSON"],
          }),
        );
      }
      setOpen(false);
      await api.other.closeChoice(choice);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) setOpen(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("closeChoice.title")}</DialogTitle>
          <DialogDescription>{t("closeChoice.description")}</DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm transition-colors hover:bg-row-hover">
          <Checkbox
            className="mt-0.5"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <span className="grid min-w-0 gap-1">
            <span className="leading-none">{t("closeChoice.remember")}</span>
            <span className="text-xs leading-4 text-muted-foreground">
              {t("closeChoice.rememberHint", {
                path: `${t("settings.title")} → ${t("settings.sections.system")}`,
              })}
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void choose("quit")}
          >
            {t("closeChoice.quit")}
          </Button>
          <Button
            autoFocus
            disabled={busy !== null}
            onClick={() => void choose("tray")}
          >
            {t("closeChoice.tray")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
