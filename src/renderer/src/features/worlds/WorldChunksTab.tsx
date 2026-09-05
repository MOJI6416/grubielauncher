import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Globe, Map as MapIcon, TriangleAlert } from "lucide-react";
import { IWorld } from "@/types/World";
import {
  END_ID,
  IChunkDimension,
  NETHER_ID,
  OVERWORLD_ID,
} from "@/types/WorldChunks";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@renderer/components/Hint";
import { formatBytes } from "@renderer/utilities/file";
import { ChunkEditorDialog } from "./chunks/ChunkEditorDialog";

const api = window.api;

const DIMENSION_LABELS: Record<string, string> = {
  [OVERWORLD_ID]: "overworld",
  [NETHER_ID]: "nether",
  [END_ID]: "end",
};

type Status = "loading" | "ready" | "error";

export function WorldChunksTab({
  world,
  locked,
  lockReason,
  locale,
  onChanged,
}: {
  world: IWorld;
  locked: boolean;
  lockReason?: string;
  locale: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [dimensions, setDimensions] = useState<IChunkDimension[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [open, setOpen] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await api.worldChunks.dimensions(world.path);
      if (!mounted.current) return;
      setDimensions(list ?? []);
      setStatus("ready");
    } catch (error) {
      console.error(error);
      if (!mounted.current) return;
      setStatus("error");
    }
  }, [world.path]);

  useEffect(() => {
    setStatus("loading");
    void load();
  }, [load]);

  const nf = (value: number) => new Intl.NumberFormat(locale).format(value);
  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const totalChunks = dimensions.reduce(
    (sum, entry) => sum + entry.chunkCount,
    0,
  );
  const totalRegions = dimensions.reduce(
    (sum, entry) => sum + entry.regionCount,
    0,
  );
  const totalSize = dimensions.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  const dimensionLabel = (id: string) => {
    const key = DIMENSION_LABELS[id];
    return key ? t(`worldChunks.dimensions.${key}`) : id;
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <Empty className="h-full border border-dashed border-border bg-surface-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("worldChunks.loadError")}</EmptyTitle>
          <EmptyDescription>{t("worldChunks.loadErrorHint")}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {t("common.retry")}
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-xs font-medium">{t("worldChunks.tabTitle")}</p>
          <p className="text-[0.7rem] leading-4 text-muted-foreground">
            {t("worldChunks.tabHint")}
          </p>
        </div>
        <Hint content={locked ? t("worldChunks.openReadOnly") : undefined}>
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setOpen(true)}
          >
            <MapIcon className="size-3.5" />
            {t("worldChunks.open")}
          </Button>
        </Hint>
      </div>

      {totalRegions === 0 ? (
        <Empty className="flex-1 border border-dashed border-border bg-surface-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Boxes />
            </EmptyMedia>
            <EmptyTitle>{t("worldChunks.noRegions")}</EmptyTitle>
            <EmptyDescription>
              {t("worldChunks.noRegionsHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[0.65rem] text-faint">
            {t("worldChunks.summary", {
              regions: nf(totalRegions),
              chunks: nf(totalChunks),
              size: formatBytes(totalSize, sizeLabels, 1),
            })}
          </p>

          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {dimensions.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2.5 rounded-xl border bg-surface-1 px-3 py-2"
              >
                <Globe className="size-4 shrink-0 text-faint" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Hint content={entry.id} variant="text" truncatedOnly>
                    <span className="truncate text-xs font-medium">
                      {dimensionLabel(entry.id)}
                    </span>
                  </Hint>
                  <span className="truncate font-mono text-[0.65rem] text-faint">
                    {t("worldChunks.dimensionFacts", {
                      regions: nf(entry.regionCount),
                      chunks: nf(entry.chunkCount),
                      size: formatBytes(entry.sizeBytes, sizeLabels, 1),
                    })}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {entry.hasEntities && (
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                      {t("worldChunks.chunk.entitiesFile")}
                    </span>
                  )}
                  {entry.hasPoi && (
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                      {t("worldChunks.chunk.poiFile")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <ChunkEditorDialog
          world={world}
          locked={locked}
          lockReason={lockReason}
          locale={locale}
          onClose={() => {
            setOpen(false);
            void load();
          }}
          onChanged={() => {
            onChanged();
            void load();
          }}
        />
      )}
    </div>
  );
}
