import { useTranslation } from "react-i18next";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";

export function TranslateToggle({
  isTranslated,
  isTranslating,
  onToggle,
  className,
}: {
  isTranslated: boolean;
  isTranslating: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t(
    isTranslated ? "modManager.showOriginal" : "modManager.translateChangelog",
  );

  return (
    <Hint content={label}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={label}
        aria-pressed={isTranslated}
        disabled={isTranslating}
        onClick={onToggle}
        className={cn(
          "size-6 shrink-0",
          isTranslated ? "text-foreground" : "text-faint",
          className,
        )}
      >
        {isTranslating ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Languages className="size-3.5" />
        )}
      </Button>
    </Hint>
  );
}
