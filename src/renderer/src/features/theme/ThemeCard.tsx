import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Ellipsis,
  FileDown,
  Link2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  BUILT_IN_THEMES,
  themePalette,
  type ThemeDefinition,
} from "@/shared/themes";
import { backdropUrl } from "./themesStore";

export function themeName(
  theme: ThemeDefinition,
  t: (key: string) => string,
): string {
  return BUILT_IN_THEMES.some((item) => item.id === theme.id)
    ? t(`theme.builtIn.${theme.id}`)
    : theme.name;
}

export function ThemeSwatch({
  theme,
  accent,
  imageUrl,
  className,
}: {
  theme: ThemeDefinition;
  accent: string;
  imageUrl?: string;
  className?: string;
}) {
  const palette = themePalette(theme, accent);

  return (
    <span
      aria-hidden
      className={cn("relative flex overflow-hidden rounded-md border border-border", className)}
      style={{ background: theme.colors.background }}
    >
      {theme.backdrop && (
        <span
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{
            backgroundImage: `url("${imageUrl ?? backdropUrl(theme.backdrop.path)}")`,
          }}
        />
      )}
      <span className="relative w-1/4 shrink-0" style={{ background: palette.surface1 }} />
      <span className="relative flex min-w-0 flex-1 p-1.5">
        <span
          className="flex flex-1 flex-col justify-center gap-1 rounded-sm px-1.5"
          style={{ background: palette.surface2 }}
        >
          <span className="h-1 w-3/4 rounded-full" style={{ background: theme.colors.foreground }} />
          <span className="h-1 w-1/2 rounded-full" style={{ background: palette.muted }} />
          <span className="h-1.5 w-6 rounded-full" style={{ background: palette.primary }} />
        </span>
      </span>
    </span>
  );
}

export function ThemeCard({
  theme,
  accent,
  active,
  isBuiltIn,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
  onCopyCode,
  onPublish,
}: {
  theme: ThemeDefinition;
  accent: string;
  active: boolean;
  isBuiltIn: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onCopyCode: () => void;
  onPublish: () => void;
}) {
  const { t } = useTranslation();
  const name = themeName(theme, t);

  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={active}
      aria-label={name}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 rounded-lg border p-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary/50 bg-primary-soft"
          : "border-border bg-surface-2 hover:bg-surface-3",
      )}
    >
      <ThemeSwatch theme={theme} accent={accent} className="h-14" />
      <span className="flex min-w-0 items-center gap-1.5 pr-6">
        {active && <Check className="size-3.5 shrink-0 text-primary" />}
        <span className="truncate text-sm font-medium text-foreground">{name}</span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t("common.more")} — ${name}`}
            onClick={(event) => event.stopPropagation()}
            className="absolute right-1.5 bottom-1.5 size-6 text-faint"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onClick={(event) => event.stopPropagation()}
        >
          {!isBuiltIn && (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              <span>{t("theme.edit")}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy />
            <span>{t("theme.duplicate")}</span>
          </DropdownMenuItem>
          {!isBuiltIn && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onExport}>
                <FileDown />
                <span>{t("theme.transfer.export")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCopyCode}>
                <Link2 />
                <span>{t("theme.transfer.copyCode")}</span>
              </DropdownMenuItem>
              {!theme.galleryId && (
                <DropdownMenuItem onSelect={onPublish}>
                  <Upload />
                  <span>{t("theme.gallery.publish")}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                <span>{t("theme.delete")}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
