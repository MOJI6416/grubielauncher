import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Ellipsis,
  FileDown,
  Image as ImageIcon,
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
import { BUILT_IN_THEMES, type ThemeDefinition } from "@/shared/themes";
import { Hint } from "@renderer/components/Hint";
import { ThemeMiniature } from "./ThemeMiniature";

export function themeName(
  theme: ThemeDefinition,
  t: (key: string) => string,
): string {
  return BUILT_IN_THEMES.some((item) => item.id === theme.id)
    ? t(`theme.builtIn.${theme.id}`)
    : theme.name;
}

export function ThemeTraits({
  theme,
}: {
  theme: Pick<ThemeDefinition, "colors"> & { backdrop: unknown };
}) {
  const { t } = useTranslation();

  return (
    <>
      {!!theme.backdrop && (
        <Hint content={t("theme.gallery.withPicture")}>
          <ImageIcon className="size-3 shrink-0" aria-label={t("theme.gallery.withPicture")} />
        </Hint>
      )}
      {theme.colors.accent && (
        <Hint content={t("theme.card.ownAccent")}>
          <span
            role="img"
            aria-label={t("theme.card.ownAccent")}
            className="size-2.5 shrink-0 rounded-full ring-1 ring-border"
            style={{ background: theme.colors.accent }}
          />
        </Hint>
      )}
    </>
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
        "group flex cursor-pointer flex-col gap-2 rounded-lg border p-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary/60 bg-primary-soft"
          : "border-border bg-surface-2 hover:bg-surface-3",
      )}
    >
      <ThemeMiniature
        theme={theme}
        accent={accent}
        className={cn(
          "rounded-md ring-1 transition-shadow",
          active ? "ring-primary/60" : "ring-border",
        )}
      />
      <div className="flex min-w-0 items-center gap-1 pl-1">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            {active && <Check className="size-3.5 shrink-0 text-primary" />}
            <Hint content={name} truncatedOnly>
              <span className="truncate text-sm font-medium text-foreground">{name}</span>
            </Hint>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-faint">
            <span className="truncate">{t(`theme.editor.modes.${theme.mode}`)}</span>
            <ThemeTraits theme={theme} />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${t("common.more")} — ${name}`}
              onClick={(event) => event.stopPropagation()}
              className="size-7 shrink-0 text-faint"
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
    </div>
  );
}
