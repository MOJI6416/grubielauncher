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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

interface ThemeMenuActions {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onCopyCode: () => void;
  onPublish: () => void;
}

function ThemeMenuItems({
  menu,
  theme,
  isBuiltIn,
  actions,
}: {
  menu: "dropdown" | "context";
  theme: ThemeDefinition;
  isBuiltIn: boolean;
  actions: ThemeMenuActions;
}) {
  const { t } = useTranslation();
  const Item = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;

  return (
    <>
      {!isBuiltIn && (
        <Item onSelect={actions.onEdit}>
          <Pencil />
          <span>{t("theme.edit")}</span>
        </Item>
      )}
      <Item onSelect={actions.onDuplicate}>
        <Copy />
        <span>{t("theme.duplicate")}</span>
      </Item>
      {!isBuiltIn && (
        <>
          <Separator />
          <Item onSelect={actions.onExport}>
            <FileDown />
            <span>{t("theme.transfer.export")}</span>
          </Item>
          <Item onSelect={actions.onCopyCode}>
            <Link2 />
            <span>{t("theme.transfer.copyCode")}</span>
          </Item>
          {!theme.galleryId && (
            <Item onSelect={actions.onPublish}>
              <Upload />
              <span>{t("theme.gallery.publish")}</span>
            </Item>
          )}
          <Separator />
          <Item variant="destructive" onSelect={actions.onDelete}>
            <Trash2 />
            <span>{t("theme.delete")}</span>
          </Item>
        </>
      )}
    </>
  );
}

export function ThemeCard({
  theme,
  accent,
  active,
  isBuiltIn,
  tabIndex,
  onSelect,
  ...actions
}: {
  theme: ThemeDefinition;
  accent: string;
  active: boolean;
  isBuiltIn: boolean;
  tabIndex: number;
  onSelect: () => void;
} & ThemeMenuActions) {
  const { t } = useTranslation();
  const name = themeName(theme, t);
  const moreLabel = `${t("common.more")} — ${name}`;
  const modeLabel = t(`theme.editor.modes.${theme.mode}`);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="radio"
          tabIndex={tabIndex}
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
                <Hint content={name} variant="text" truncatedOnly>
                  <span className="truncate text-sm font-medium text-foreground">{name}</span>
                </Hint>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-faint">
                <Hint content={modeLabel} variant="text" truncatedOnly>
                  <span className="truncate">{modeLabel}</span>
                </Hint>
                <ThemeTraits theme={theme} />
              </div>
            </div>

            <DropdownMenu>
              <Hint content={moreLabel}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={moreLabel}
                    onClick={(event) => event.stopPropagation()}
                    className="size-7 shrink-0 text-faint"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onClick={(event) => event.stopPropagation()}
              >
                <ThemeMenuItems
                  menu="dropdown"
                  theme={theme}
                  isBuiltIn={isBuiltIn}
                  actions={actions}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ThemeMenuItems
          menu="context"
          theme={theme}
          isBuiltIn={isBuiltIn}
          actions={actions}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
