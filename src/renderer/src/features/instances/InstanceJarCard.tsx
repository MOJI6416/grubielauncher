import { useTranslation } from "react-i18next";
import { FileArchive, Replace } from "lucide-react";
import type { IVersionConf } from "@/types/IVersion";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { SectionCard } from "./SectionCard";
import { summarizeJarMods } from "./jarMods";

export function InstanceJarCard({
  conf,
  onOpen,
}: {
  conf: IVersionConf;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { total, active, replacement } = summarizeJarMods(conf);
  const title = replacement
    ? replacement.name
    : t("jarMods.base.vanillaTitle", { version: conf.version.id });

  return (
    <SectionCard
      title={t("jarMods.title")}
      icon={FileArchive}
      className="shrink-0"
      bodyClassName="flex items-center gap-3 px-3 py-2.5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
        {replacement ? (
          <Replace className="size-4 text-warning" />
        ) : (
          <FileArchive className="size-4 text-faint" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Hint content={title} variant="text" truncatedOnly>
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
        </Hint>
        <span className="truncate text-[0.7rem] text-muted-foreground">
          {total > 0
            ? t("jarMods.card.count", { active, total })
            : t("jarMods.card.none")}
        </span>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={onOpen}
      >
        {t("jarMods.card.open")}
      </Button>
    </SectionCard>
  );
}

export function JarModsRow({
  conf,
  onOpen,
}: {
  conf: IVersionConf;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { total, active, replacement } = summarizeJarMods(conf);
  const summary = [
    replacement?.name,
    total > 0
      ? t("jarMods.card.count", { active, total })
      : t("jarMods.card.none"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-9 min-w-0 items-center gap-2 border-t border-border/60 px-3">
      {replacement ? (
        <Replace className="size-3.5 shrink-0 text-warning" />
      ) : (
        <FileArchive className="size-3.5 shrink-0 text-faint" />
      )}
      <span className="shrink-0 text-xs font-medium">{t("jarMods.title")}</span>
      <Hint content={summary} variant="text" truncatedOnly>
        <span className="min-w-0 flex-1 truncate text-[0.7rem] text-muted-foreground">
          {summary}
        </span>
      </Hint>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="shrink-0 text-muted-foreground"
        onClick={onOpen}
      >
        {t("jarMods.card.open")}
      </Button>
    </div>
  );
}
