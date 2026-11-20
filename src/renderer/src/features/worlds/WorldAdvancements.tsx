import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Flag } from "lucide-react";
import { IWorld, IWorldAdvancementGroup, IWorldAdvancements } from "@/types/World";
import { ILocalProject } from "@/types/ModManager";
import { Hint } from "@renderer/components/Hint";
import { Skeleton } from "@/components/ui/skeleton";
import { accountAtom } from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { formatNumber } from "@renderer/utilities/numbers";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

export type WorldAdvancementsState =
  | { status: "loading" }
  | { status: "ready"; data: IWorldAdvancements | null };

export function useWorldAdvancements(
  world: IWorld,
  gameVersion: string | undefined,
): WorldAdvancementsState {
  const account = useAtomValue(accountAtom);
  const [state, setState] = useState<WorldAdvancementsState>({
    status: "loading",
  });
  const disabled = useLatestRef(world.disabledDatapacks);
  const datapackKey = [
    ...world.datapacks,
    "|",
    ...(world.disabledDatapacks ?? []),
  ].join("\u0000");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    if (!account) {
      setState({ status: "ready", data: null });
      return;
    }

    void api.worlds
      .advancements(world.path, account, gameVersion, disabled.current)
      .catch(ignoreFailure)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data: data ?? null });
      });

    return () => {
      cancelled = true;
    };
  }, [account, world.path, gameVersion, datapackKey, disabled]);

  return state;
}

function prettify(namespace: string): string {
  const words = namespace.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : namespace;
}

export function useGroupTitle(mods: ILocalProject[] | undefined) {
  const byFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const mod of mods ?? []) {
      for (const file of mod.version?.files ?? []) {
        if (file.filename) map.set(file.filename.toLowerCase(), mod.title);
      }
    }
    return map;
  }, [mods]);

  return (group: IWorldAdvancementGroup) => {
    if (group.source === "game") return "Minecraft";
    if (group.source === "mod" && group.file) {
      return byFile.get(group.file.toLowerCase()) ?? prettify(group.namespace);
    }
    return group.file?.replace(/\.zip$/i, "") ?? prettify(group.namespace);
  };
}

function percent(done: number, total: number): number {
  return total > 0 ? Math.floor((done / total) * 100) : 0;
}

function Bar({
  done,
  total,
  wide,
}: {
  done: number;
  total: number;
  wide?: boolean;
}) {
  return (
    <span
      className={`block h-1.5 min-w-0 overflow-hidden rounded-full bg-surface-3 ${
        wide ? "w-full" : "flex-1"
      }`}
    >
      <span
        className="block h-full rounded-full bg-success"
        style={{ width: `${total > 0 ? Math.max(done > 0 ? 3 : 0, (done / total) * 100) : 0}%` }}
      />
    </span>
  );
}

export function AdvancementsSummary({
  state,
  locale,
  onOpenDetails,
}: {
  state: WorldAdvancementsState;
  locale: string;
  onOpenDetails: () => void;
}) {
  const { t } = useTranslation();

  if (state.status === "loading") {
    return <Skeleton className="h-11 shrink-0 rounded-xl" />;
  }

  const data = state.data;
  if (!data) return null;

  const nf = (value: number) => formatNumber(value, locale);
  const value = t("worldAdvancements.progress", {
    done: nf(data.done),
    total: nf(data.total),
    percent: percent(data.done, data.total),
  });

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="flex shrink-0 items-center gap-3 rounded-xl border bg-surface-1 px-3 py-2 text-left transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Flag className="size-4 shrink-0 text-faint" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("worldAdvancements.title")}
          </span>
          <Hint
            content={data.hasProgress ? value : t("worldAdvancements.notStarted")}
            variant="text"
            truncatedOnly
          >
            <span className="ml-auto min-w-0 truncate text-xs font-semibold whitespace-nowrap tabular-nums">
              {data.hasProgress ? value : t("worldAdvancements.notStarted")}
            </span>
          </Hint>
        </span>
        <Bar done={data.done} total={data.total} wide />
      </span>
    </button>
  );
}

export function AdvancementsBreakdown({
  state,
  mods,
  locale,
}: {
  state: WorldAdvancementsState;
  mods: ILocalProject[] | undefined;
  locale: string;
}) {
  const { t } = useTranslation();
  const titleOf = useGroupTitle(mods);

  if (state.status === "loading") {
    return <Skeleton className="h-24 shrink-0 rounded-xl" />;
  }

  const data = state.data;
  if (!data) return null;

  const nf = (value: number) => formatNumber(value, locale);

  return (
    <div className="flex min-w-0 shrink-0 flex-col rounded-xl border bg-surface-1">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
        <span className="min-w-0 flex-1 truncate">
          {t("worldAdvancements.title")}
        </span>
        <span className="shrink-0 font-mono whitespace-nowrap text-faint tabular-nums normal-case">
          {t("worldAdvancements.progress", {
            done: nf(data.done),
            total: nf(data.total),
            percent: percent(data.done, data.total),
          })}
        </span>
      </div>

      {!data.hasProgress && (
        <p className="px-3 pt-2 text-xs text-muted-foreground">
          {t("worldAdvancements.notStartedHint")}
        </p>
      )}

      <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto p-3">
        {data.groups.map((group) => {
          const title = titleOf(group);
          return (
            <div
              key={`${group.source}:${group.namespace}`}
              className="flex min-w-0 items-center gap-2"
            >
              <Hint content={title} variant="text" truncatedOnly>
                <span className="w-36 shrink-0 truncate text-xs">{title}</span>
              </Hint>
              <Bar done={group.done} total={group.total} />
              <span className="shrink-0 text-right font-mono text-3xs whitespace-nowrap text-muted-foreground tabular-nums">
                {nf(group.done)}/{nf(group.total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
