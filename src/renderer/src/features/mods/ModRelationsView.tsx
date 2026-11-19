import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ChevronRight, CircleAlert, CircleHelp, Link2, PackageCheck } from "lucide-react";
import type { ILocalProject } from "@/types/ModManager";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@renderer/components/Hint";
import { displayTitle } from "./titles";
import type { DeclaredRelation, ModRelations } from "./modRelations";

function Group({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
        <span className="font-mono text-3xs text-faint tabular-nums">{count}</span>
      </h4>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function ModLine({
  mod,
  title,
  note,
  tone,
  onOpen,
}: {
  mod?: ILocalProject;
  title: string;
  note?: string;
  tone?: "warning";
  onOpen?: (mod: ILocalProject) => void;
}) {
  const label = displayTitle(title);
  const content = (
    <>
      <Hint content={title} variant="text" truncatedOnly={label === title}>
        <span
          className={
            tone === "warning"
              ? "min-w-0 flex-1 truncate text-xs text-warning"
              : "min-w-0 flex-1 truncate text-xs text-foreground"
          }
        >
          {label}
        </span>
      </Hint>
      {note && <span className="shrink-0 text-2xs text-faint">{note}</span>}
      {mod && onOpen && <ChevronRight className="size-3.5 shrink-0 text-faint" />}
    </>
  );

  if (mod && onOpen) {
    return (
      <button
        type="button"
        className="flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => onOpen(mod)}
      >
        {content}
      </button>
    );
  }

  return <div className="flex h-7 min-w-0 items-center gap-2 px-2">{content}</div>;
}

function declared(
  items: DeclaredRelation[],
  notInstalled: string,
  onOpen?: (mod: ILocalProject) => void,
  tone?: "warning",
) {
  return items.map((item, index) => (
    <ModLine
      key={`${item.title}-${index}`}
      mod={item.mod}
      title={item.title}
      note={item.mod ? undefined : notInstalled}
      tone={item.mod ? tone : undefined}
      onOpen={onOpen}
    />
  ));
}

export function ModRelationsView({
  relations,
  isScanning,
  onOpen,
}: {
  relations: ModRelations;
  isScanning: boolean;
  onOpen?: (mod: ILocalProject) => void;
}) {
  const { t } = useTranslation();
  const notInstalled = t("modManager.relations.notInstalled");
  const isEmpty =
    relations.requires.length === 0 &&
    relations.requiredBy.length === 0 &&
    relations.optional.length === 0 &&
    relations.embedded.length === 0 &&
    relations.conflicts.length === 0;

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-lg bg-surface-2 p-2.5">
      <p className="text-2xs leading-snug text-faint">
        {t("modManager.relations.hint")}
      </p>

      {relations.requires.length > 0 && (
        <Group
          icon={<CircleAlert className="size-3.5" />}
          title={t("modManager.relations.requires")}
          count={relations.requires.length}
        >
          {relations.requires.map((mod) => (
            <ModLine key={`${mod.provider}:${mod.id}`} mod={mod} title={mod.title} onOpen={onOpen} />
          ))}
        </Group>
      )}

      {relations.requiredBy.length > 0 && (
        <Group
          icon={<Link2 className="size-3.5" />}
          title={t("modManager.relations.requiredBy")}
          count={relations.requiredBy.length}
        >
          {relations.requiredBy.map((mod) => (
            <ModLine key={`${mod.provider}:${mod.id}`} mod={mod} title={mod.title} onOpen={onOpen} />
          ))}
        </Group>
      )}

      {relations.optional.length > 0 && (
        <Group
          icon={<CircleHelp className="size-3.5" />}
          title={t("modManager.relations.optional")}
          count={relations.optional.length}
        >
          {declared(relations.optional, notInstalled, onOpen)}
        </Group>
      )}

      {relations.embedded.length > 0 && (
        <Group
          icon={<PackageCheck className="size-3.5" />}
          title={t("modManager.relations.embedded")}
          count={relations.embedded.length}
        >
          {relations.embedded.map((id) => (
            <div key={id} className="flex h-7 min-w-0 items-center px-2">
              <Hint content={id} variant="text" truncatedOnly>
                <span className="truncate font-mono text-2xs text-muted-foreground">
                  {id}
                </span>
              </Hint>
            </div>
          ))}
        </Group>
      )}

      {relations.conflicts.length > 0 && (
        <Group
          icon={<Ban className="size-3.5" />}
          title={t("modManager.relations.conflicts")}
          count={relations.conflicts.length}
        >
          {declared(relations.conflicts, notInstalled, onOpen, "warning")}
        </Group>
      )}

      {isScanning ? (
        <div aria-hidden className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-2/3 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      ) : (
        isEmpty && (
          <p className="text-xs text-muted-foreground">
            {t("modManager.relations.none")}
          </p>
        )
      )}
    </div>
  );
}
