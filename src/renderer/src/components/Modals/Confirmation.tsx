import { useMemo, useState } from "react"; // Изменено: добавили useMemo/useState
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export function Confirmation({
  onClose,
  title,
  content,
  buttons,
}: {
  onClose: () => void;
  title?: string;
  content: {
    text: string;
    color?:
      | "primary"
      | "danger"
      | "success"
      | "warning"
      | "default"
      | "secondary";
  }[];
  buttons: {
    text: string;
    color?:
      | "primary"
      | "danger"
      | "success"
      | "warning"
      | "default"
      | "secondary";
    loading?: boolean;
    onClick: () => Promise<void> | void;
  }[];
}) {
  const { t } = useTranslation();

  const [activeBtn, setActiveBtn] = useState<number | null>(null);

  const isBusy = useMemo(
    () => activeBtn !== null || buttons.some((b) => !!b.loading),
    [activeBtn, buttons],
  );

  const getButtonVariant = (color: (typeof buttons)[number]["color"]) => {
    if (color === "danger") return "destructive";
    if (color === "default" || color === "secondary") return "secondary";
    return "default";
  };

  const getAlertClassName = (color: (typeof content)[number]["color"]) => {
    if (color === "danger") return "border-destructive/40 text-destructive";
    if (color === "warning") return "border-[var(--warning)]/40";
    if (color === "success") return "border-[var(--success)]/40";
    return "";
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open || isBusy) return;
        onClose();
      }}
    >
      <DialogContent
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title || t("common.confirmation")}</DialogTitle>
        </DialogHeader>
        <div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {content.map((c, index) => (
                <Alert key={index} className={getAlertClassName(c.color)}>
                  <AlertTitle>{c.text}</AlertTitle>
                </Alert>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <div className="flex flex-wrap justify-end gap-2">
            {buttons.map((b, index) => (
              <Button
                variant={getButtonVariant(b.color)}
                key={index}
                disabled={isBusy && activeBtn !== index}
                onClick={async () => {
                  if (isBusy && activeBtn !== index) return;
                  try {
                    setActiveBtn(index);
                    await b.onClick();
                  } finally {
                    setActiveBtn(null);
                  }
                }}
              >
                {(b.loading || activeBtn === index) && (
                  <Loader2 className="animate-spin" />
                )}
                {b.text}
              </Button>
            ))}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
