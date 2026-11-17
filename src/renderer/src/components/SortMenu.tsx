import type { ReactNode } from "react";
import { ArrowDownWideNarrow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

export function SortMenu<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  children,
}: {
  value: T;
  options: SortOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const current = options.find((option) => option.value === value);
  const label = current
    ? t("common.sortBy", { value: current.label })
    : t("common.sort");

  return (
    <DropdownMenu>
      <Hint content={label}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label}
            className={cn("size-8 shrink-0", className)}
          >
            <ArrowDownWideNarrow className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-2xs text-faint">
          {t("common.sort")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as T)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
