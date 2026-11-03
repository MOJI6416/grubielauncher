import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";

export function SlotToggle({
  hidden,
  label,
  onToggle,
  className,
}: {
  hidden: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const text = hidden
    ? t("layout.show", { name: label })
    : t("layout.hide", { name: label });

  return (
    <Hint content={text} side="right">
      <button
        type="button"
        aria-label={text}
        aria-pressed={!hidden}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          hidden && "text-muted-foreground",
          className,
        )}
      >
        {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </Hint>
  );
}
