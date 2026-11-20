import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";

export function LoadMoreRow({
  isLoading,
  failedText,
  onRetry,
}: {
  isLoading: boolean;
  failedText?: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  if (failedText) {
    return (
      <div className="flex min-w-0 items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
        <Hint content={failedText} variant="text" truncatedOnly>
          <span className="min-w-0 truncate">{failedText}</span>
        </Hint>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-2 text-xs"
          onClick={onRetry}
        >
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (!isLoading) return null;

  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      className="flex justify-center py-2 text-faint"
    >
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}
