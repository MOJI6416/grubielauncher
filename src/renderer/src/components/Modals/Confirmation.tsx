import { useMemo, useState } from "react";
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
import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react";

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

  const isAlert = (color: (typeof content)[number]["color"]) =>
    color === "danger" || color === "warning" || color === "success";

  const getAlertVariant = (color: (typeof content)[number]["color"]) => {
    if (color === "danger") return "destructive" as const;
    if (color === "warning") return "warning" as const;
    if (color === "success") return "success" as const;
    return "info" as const;
  };

  const getAlertIcon = (color: (typeof content)[number]["color"]) => {
    if (color === "danger") return <CircleX />;
    if (color === "warning") return <TriangleAlert />;
    if (color === "success") return <CircleCheck />;
    return <Info />;
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
        aria-describedby={undefined}
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
        <div className="flex flex-col gap-2">
          {content.map((c, index) =>
            isAlert(c.color) ? (
              <Alert key={index} variant={getAlertVariant(c.color)}>
                {getAlertIcon(c.color)}
                <AlertTitle>{c.text}</AlertTitle>
              </Alert>
            ) : (
              <p key={index} className="text-sm text-muted-foreground">
                {c.text}
              </p>
            ),
          )}
        </div>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
