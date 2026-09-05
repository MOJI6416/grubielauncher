import { useTranslation } from "react-i18next";
import {
  Copy,
  Loader2,
  MousePointer2,
  Timer,
  Trash,
  TriangleAlert,
} from "lucide-react";
import {
  BLOCKS_PER_CHUNK,
  IChunkDetails,
  IChunkSummary,
  REGION_SECTOR_BYTES,
} from "@/types/WorldChunks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@renderer/components/Hint";
import { formatDate } from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import { copyToClipboard } from "@renderer/utilities/clipboard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { inhabitedMinutes } from "./chunkFilters";
import { ChunkLookup } from "./chunkModel";
import { SelectionStats } from "./chunkSelection";
import { ChunkPoint } from "./ChunkMap";

const MAX_LIST_ROWS = 10;

export type DetailsStatus = "idle" | "loading" | "ready" | "missing" | "error";

export function ChunkInspector({
  locale,
  stats,
  locked,
  lockReason,
  busy,
  focused,
  lookup,
  details,
  detailsStatus,
  onDelete,
  onReset,
  onSelectRegion,
}: {
  locale: string;
  stats: SelectionStats;
  locked: boolean;
  lockReason?: string;
  busy: boolean;
  focused: ChunkPoint | null;
  lookup: ChunkLookup | null;
  details: IChunkDetails | null;
  detailsStatus: DetailsStatus;
  onDelete: () => void;
  onReset: () => void;
  onSelectRegion: (chunk: ChunkPoint) => void;
}) {
  const { t } = useTranslation();
  const nf = (value: number) => new Intl.NumberFormat(locale).format(value);
  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const summary: IChunkSummary | null = details ?? lookup?.chunk ?? null;
  const canAct = !locked && !busy && stats.count > 0;

  return (
    <div className="flex min-h-0 flex-col">
      <section className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold">
            {t("worldChunks.selection.title")}
          </h3>
          <span className="font-mono text-[0.65rem] text-faint">
            {t("worldChunks.selection.count", { count: stats.count })}
          </span>
        </div>

        {stats.count === 0 ? (
          <p className="text-[0.7rem] leading-4 text-muted-foreground">
            {t("worldChunks.selection.empty")}
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[0.7rem]">
            <Row
              label={t("worldChunks.selection.regions")}
              value={nf(stats.regions)}
            />
            <Row
              label={t("worldChunks.selection.size")}
              value={formatBytes(stats.sizeBytes, sizeLabels, 1)}
            />
            <Row
              label={t("worldChunks.selection.inhabited")}
              value={t("worldChunks.minutes", {
                count: Math.round(inhabitedMinutes(stats.inhabitedTicks)),
              })}
            />
            {stats.problems > 0 && (
              <Row
                label={t("worldChunks.selection.problems")}
                value={nf(stats.problems)}
                tone="destructive"
              />
            )}
          </dl>
        )}

        {stats.unscanned > 0 && (
          <p className="text-[0.65rem] leading-4 text-warning">
            {t("worldChunks.selection.unscanned", { count: stats.unscanned })}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Hint content={locked ? lockReason : undefined}>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 w-full"
              disabled={!canAct}
              onClick={onDelete}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Trash />}
              {t("worldChunks.actions.delete")}
            </Button>
          </Hint>
          <Hint
            content={locked ? lockReason : t("worldChunks.actions.resetHint")}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full"
              disabled={!canAct}
              onClick={onReset}
            >
              <Timer />
              {t("worldChunks.actions.reset")}
            </Button>
          </Hint>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">
            {t("worldChunks.chunk.title")}
          </h3>
          {focused && (
            <span className="font-mono text-[0.65rem] text-faint">
              {focused.x} {focused.z}
            </span>
          )}
        </div>

        {!focused ? (
          <p className="flex items-start gap-1.5 text-[0.7rem] leading-4 text-muted-foreground">
            <MousePointer2 className="mt-0.5 size-3 shrink-0" />
            {t("worldChunks.chunk.pick")}
          </p>
        ) : lookup && !lookup.present ? (
          <p className="text-[0.7rem] leading-4 text-muted-foreground">
            {t("worldChunks.chunk.absent")}
          </p>
        ) : (
          <ChunkFacts
            focused={focused}
            summary={summary}
            details={details}
            detailsStatus={detailsStatus}
            nf={nf}
            sizeLabels={sizeLabels}
            onSelectRegion={onSelectRegion}
          />
        )}
      </section>
    </div>
  );
}

function ChunkFacts({
  focused,
  summary,
  details,
  detailsStatus,
  nf,
  sizeLabels,
  onSelectRegion,
}: {
  focused: ChunkPoint;
  summary: IChunkSummary | null;
  details: IChunkDetails | null;
  detailsStatus: DetailsStatus;
  nf: (value: number) => string;
  sizeLabels: string[];
  onSelectRegion: (chunk: ChunkPoint) => void;
}) {
  const { t } = useTranslation();

  const blockX = focused.x * BLOCKS_PER_CHUNK;
  const blockZ = focused.z * BLOCKS_PER_CHUNK;
  const regionName = `r.${focused.x >> 5}.${focused.z >> 5}.mca`;

  const copyCoordinates = async () => {
    const text = `${blockX + 8} ~ ${blockZ + 8}`;
    if (await copyToClipboard(text)) toast.success(t("common.copied"));
    else toast.error(t("common.copyFailed"));
  };

  const problem = summary?.problem ?? null;

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[0.7rem]">
        <Row
          label={t("worldChunks.chunk.blocks")}
          value={`${blockX}…${blockX + 15}, ${blockZ}…${blockZ + 15}`}
          mono
        />
        <Row label={t("worldChunks.chunk.region")} value={regionName} mono />
        {summary && (
          <>
            <Row
              label={t("worldChunks.chunk.status")}
              value={
                summary.status
                  ? summary.status === "full"
                    ? t("worldChunks.status.full")
                    : t("worldChunks.status.partial", {
                        status: summary.status,
                      })
                  : "—"
              }
            />
            <Row
              label={t("worldChunks.chunk.inhabited")}
              value={
                summary.inhabitedTime === null
                  ? "—"
                  : t("worldChunks.minutes", {
                      count:
                        Math.round(
                          inhabitedMinutes(summary.inhabitedTime) * 10,
                        ) / 10,
                    })
              }
            />
            <Row
              label={t("worldChunks.chunk.saved")}
              value={
                summary.timestamp > 0
                  ? formatDate(new Date(summary.timestamp * 1000))
                  : "—"
              }
            />
            <Row
              label={t("worldChunks.chunk.dataVersion")}
              value={
                summary.dataVersion === null ? "—" : String(summary.dataVersion)
              }
              mono
            />
            <Row
              label={t("worldChunks.chunk.size")}
              value={`${formatBytes(summary.sectors * REGION_SECTOR_BYTES, sizeLabels, 1)} · ${t(
                `worldChunks.compression.${summary.compression}`,
              )}${summary.external ? ` · ${t("worldChunks.chunk.external")}` : ""}`}
            />
            {(summary.hasEntities || summary.hasPoi) && (
              <Row
                label={t("worldChunks.chunk.sideData")}
                value={[
                  summary.hasEntities
                    ? t("worldChunks.chunk.entitiesFile")
                    : null,
                  summary.hasPoi ? t("worldChunks.chunk.poiFile") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
          </>
        )}
      </dl>

      {problem && (
        <Alert
          variant={problem === "unsupported" ? "info" : "destructive"}
          className="py-2"
        >
          <TriangleAlert />
          <AlertDescription className="text-[0.65rem] leading-4">
            {t(`worldChunks.problems.${problem}`)}
          </AlertDescription>
        </Alert>
      )}

      {detailsStatus === "loading" && (
        <div className="flex flex-col gap-1.5" aria-busy>
          <Skeleton className="h-3 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
      )}

      {detailsStatus === "error" && (
        <p className="text-[0.65rem] text-destructive">
          {t("worldChunks.chunk.detailsError")}
        </p>
      )}

      {details && detailsStatus === "ready" && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[0.7rem]">
          {details.sectionCount !== null && (
            <Row
              label={t("worldChunks.chunk.sections")}
              value={
                details.yMin !== null && details.yMax !== null
                  ? `${nf(details.sectionCount)} · Y ${details.yMin * 16}…${details.yMax * 16 + 15}`
                  : nf(details.sectionCount)
              }
              mono
            />
          )}
          {details.lightOn !== null && (
            <Row
              label={t("worldChunks.chunk.light")}
              value={details.lightOn ? t("common.yes") : t("common.no")}
            />
          )}
          {details.poiCount !== null && (
            <Row
              label={t("worldChunks.chunk.poi")}
              value={nf(details.poiCount)}
            />
          )}
          {details.structureStarts.length > 0 && (
            <Row
              label={t("worldChunks.chunk.structures")}
              value={details.structureStarts.map(stripNamespace).join(", ")}
            />
          )}
          {details.biomes.length > 0 && (
            <Row
              label={t("worldChunks.chunk.biomes")}
              value={details.biomes.map(stripNamespace).join(", ")}
            />
          )}
        </dl>
      )}

      {details && detailsStatus === "ready" && (
        <>
          <IdList
            title={t("worldChunks.chunk.entities")}
            entries={details.entities.map((entry) => ({
              id: entry.id,
              count: entry.count,
            }))}
            nf={nf}
          />
          <IdList
            title={t("worldChunks.chunk.blockEntities")}
            entries={groupBlockEntities(details.blockEntities)}
            nf={nf}
          />
        </>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="xs"
          onClick={() => void copyCoordinates()}
        >
          <Copy />
          {t("worldChunks.chunk.copyCoords")}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onSelectRegion(focused)}
        >
          {t("worldChunks.chunk.selectRegion")}
        </Button>
      </div>
    </div>
  );
}

function groupBlockEntities(
  entries: IChunkDetails["blockEntities"],
): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries)
    counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function stripNamespace(id: string): string {
  return id.startsWith("minecraft:") ? id.slice("minecraft:".length) : id;
}

function IdList({
  title,
  entries,
  nf,
}: {
  title: string;
  entries: { id: string; count: number }[];
  nf: (value: number) => string;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const shown = entries.slice(0, MAX_LIST_ROWS);
  const hidden = entries.length - shown.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-medium text-muted-foreground">
          {title}
        </span>
        <span className="font-mono text-[0.65rem] text-faint">{nf(total)}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {shown.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-2 text-[0.65rem]"
          >
            <Hint content={entry.id} variant="text" truncatedOnly>
              <span className="truncate font-mono">
                {stripNamespace(entry.id)}
              </span>
            </Hint>
            <span className="shrink-0 font-mono text-faint">
              {nf(entry.count)}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <span className="text-[0.6rem] text-faint">
          {t("worldChunks.chunk.moreRows", { count: hidden })}
        </span>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "destructive";
}) {
  return (
    <>
      <dt className="truncate text-faint">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right",
          mono && "font-mono",
          tone === "destructive" ? "text-destructive" : "text-foreground",
        )}
        title={value}
      >
        {value}
      </dd>
    </>
  );
}
