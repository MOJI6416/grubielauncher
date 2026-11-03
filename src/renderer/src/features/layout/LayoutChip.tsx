import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function LayoutChip({
  label,
  hidden,
  disabled,
  onToggle,
}: {
  label: string;
  hidden: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={!hidden}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
        hidden
          ? "border-border text-faint hover:text-foreground"
          : "border-primary/40 bg-primary-soft text-foreground",
      )}
    >
      {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      {label}
    </button>
  );
}
