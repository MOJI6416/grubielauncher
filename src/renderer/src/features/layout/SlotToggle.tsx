import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";

export function SlotToggle({
  hidden,
  label,
  onToggle,
  disabled,
  disabledReason,
  className,
}: {
  hidden: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const text = hidden
    ? t("layout.show", { name: label })
    : t("layout.hide", { name: label });

  return (
    <Hint content={disabled && disabledReason ? disabledReason : text} side="right">
      <button
        type="button"
        aria-label={text}
        aria-pressed={!hidden}
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onToggle();
        }}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          hidden && "text-muted-foreground",
          disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-faint",
          className,
        )}
      >
        {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </Hint>
  );
}
