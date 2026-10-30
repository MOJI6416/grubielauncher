import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Loader2 } from "lucide-react";
import type { Loader } from "@/types/Loader";
import type { ILocalProject } from "@/types/ModManager";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@renderer/components/Hint";
import { type PortItem, portedProjects } from "@renderer/features/port/portPlan";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { useModSets } from "./modSetsStore";
import { resolveModSet } from "./resolveModSet";

const NO_SET = "none";

export function ModSetPicker({
  minecraftVersion,
  loader,
  onMods,
}: {
  minecraftVersion: string | undefined;
  loader: Loader;
  onMods: (mods: ILocalProject[]) => void;
}) {
  const { t } = useTranslation();
  const sets = useModSets();
  const [setId, setSetId] = useState("");
  const [items, setItems] = useState<PortItem[] | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const requestRef = useRef(0);
  const isManagedRef = useRef(false);
  const onModsRef = useLatestRef(onMods);

  const selected = sets?.find((set) => set.id === setId) ?? null;
  const fromSet = (items ?? []).filter(
    (item) => item.status === "updated" || item.status === "kept",
  ).length;
  const dependencies = (items ?? []).filter(
    (item) => item.status === "added",
  ).length;
  const missing = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.status === "missing" || item.status === "unchecked")
        .map((item) => item.title),
    [items],
  );

  useEffect(() => {
    if (!isManagedRef.current) return;

    const requestId = ++requestRef.current;
    setItems(null);
    onModsRef.current([]);

    if (!selected || !minecraftVersion) {
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    resolveModSet(selected, { minecraftVersion, loader }, [])
      .then((result) => {
        if (requestId !== requestRef.current) return;
        setItems(result);
        onModsRef.current(portedProjects(result));
      })
      .catch(() => {
        if (requestId === requestRef.current) setItems([]);
      })
      .finally(() => {
        if (requestId === requestRef.current) setIsResolving(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt, minecraftVersion, loader]);

  const hasSets = !!sets && sets.length > 0;

  const status = !hasSets ? (
    t("modSets.noSetsHint")
  ) : isResolving ? (
    <span className="flex items-center gap-1.5">
      <Loader2 className="size-3 animate-spin" />
      {t("modSets.resolving")}
    </span>
  ) : selected && !minecraftVersion ? (
    t("newInstance.pickVersionFirst")
  ) : selected && items ? (
    <>
      {t("modSets.resolved", { count: fromSet, total: selected.items.length })}
      {dependencies > 0 &&
        ` ${t("modSets.resolvedDependencies", { count: dependencies })}`}
      {missing.length > 0 && (
        <Hint content={missing.join(", ")} className="max-w-72">
          <span className="block truncate text-destructive">
            {t("modSets.missingNames", { names: missing.join(", ") })}
          </span>
        </Hint>
      )}
    </>
  ) : null;

  return (
    <div className="border-t border-border/60">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Layers className="size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 shrink-0 truncate text-xs text-muted-foreground">
          {t("modSets.field")}
        </span>
        <Select
          value={setId || NO_SET}
          disabled={!hasSets}
          onValueChange={(value) => {
            isManagedRef.current = true;
            setSetId(value === NO_SET ? "" : value);
          }}
        >
          <SelectTrigger
            size="sm"
            className="ml-auto h-7 w-auto max-w-44 min-w-0 text-xs"
            aria-label={t("modSets.field")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={NO_SET}>{t("modSets.none")}</SelectItem>
            {sets?.map((set) => (
              <SelectItem key={set.id} value={set.id}>
                {set.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status && (
        <p className="px-2.5 pb-2 text-[0.7rem] leading-snug text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
