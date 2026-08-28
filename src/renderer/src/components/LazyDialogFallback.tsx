import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PanelFallback } from "./PanelFallback";

type LazyDialogFallbackVariant = "compact" | "form" | "wide";

const variantClasses: Record<LazyDialogFallbackVariant, string> = {
  compact: "h-[17rem] sm:max-w-sm",
  form: "h-[25rem] sm:max-w-lg",
  wide: "h-[29rem] sm:max-w-2xl",
};

export function LazyDialogFallback({
  className,
  variant = "compact",
}: {
  className?: string;
  variant?: LazyDialogFallbackVariant;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className={cn(
          "flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden",
          variantClasses[variant],
          className,
        )}
      >
        <DialogTitle className="sr-only">{t("common.loading")}</DialogTitle>
        <PanelFallback variant="dialog" />
      </DialogContent>
    </Dialog>
  );
}
