import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@renderer/components/Hint";
import {
  CHUNK_FILTER_KINDS,
  ChunkFilter,
  ChunkFilterKind,
  ChunkFilterValues,
  DEFAULT_FILTER_VALUES,
  filterNeedsValue,
  normalizeFilterValues,
} from "./chunkFilters";
import { SelectMode } from "./chunkSelection";

const MODES: SelectMode[] = ["replace", "add", "subtract"];

export function ChunkFilterPopover({
  disabled,
  worldDataVersion,
  spawn,
  onApply,
}: {
  disabled: boolean;
  worldDataVersion: number | null;
  spawn: { x: number; z: number } | null;
  onApply: (filter: ChunkFilter, mode: SelectMode) => number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChunkFilterKind>("unvisited");
  const [mode, setMode] = useState<SelectMode>("replace");
  const [values, setValues] = useState<ChunkFilterValues>({
    ...DEFAULT_FILTER_VALUES,
    dataVersion: worldDataVersion ?? 0,
    centerX: spawn?.x ?? 0,
    centerZ: spawn?.z ?? 0,
  });
  const [matched, setMatched] = useState<number | null>(null);

  const valueKey = filterNeedsValue(kind);

  const update = (key: keyof ChunkFilterValues, raw: string) => {
    setMatched(null);
    setValues((previous) => ({ ...previous, [key]: Number(raw) }));
  };

  const apply = () => {
    const normalized = normalizeFilterValues(values);
    const count = onApply(
      { ...normalized, kind, now: Math.floor(Date.now() / 1000) },
      mode,
    );
    setValues(normalized);
    setMatched(count);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMatched(null);
      }}
    >
      <Hint content={t("worldChunks.filter.title")}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={disabled}
            aria-label={t("worldChunks.filter.title")}
          >
            <Filter className="size-3.5" />
            {t("worldChunks.filter.button")}
          </Button>
        </PopoverTrigger>
      </Hint>

      <PopoverContent align="start" className="w-80 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("worldChunks.filter.kind")}</Label>
            <Select
              value={kind}
              onValueChange={(next) => {
                setKind(next as ChunkFilterKind);
                setMatched(null);
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHUNK_FILTER_KINDS.map((entry) => (
                  <SelectItem key={entry} value={entry} className="text-xs">
                    {t(`worldChunks.filter.kinds.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.65rem] leading-4 text-muted-foreground">
              {t(`worldChunks.filter.hints.${kind}`)}
            </p>
          </div>

          {valueKey && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor={`chunk-filter-${valueKey}`}>
                {t(`worldChunks.filter.values.${valueKey}`)}
              </Label>
              <Input
                id={`chunk-filter-${valueKey}`}
                type="number"
                min={0}
                className="h-8 text-xs"
                value={values[valueKey]}
                onChange={(event) => update(valueKey, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") apply();
                }}
              />
            </div>
          )}

          {kind === "fartherThan" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="chunk-filter-center-x">
                  {t("worldChunks.filter.values.centerX")}
                </Label>
                <Input
                  id="chunk-filter-center-x"
                  type="number"
                  className="h-8 text-xs"
                  value={values.centerX}
                  onChange={(event) => update("centerX", event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs" htmlFor="chunk-filter-center-z">
                  {t("worldChunks.filter.values.centerZ")}
                </Label>
                <Input
                  id="chunk-filter-center-z"
                  type="number"
                  className="h-8 text-xs"
                  value={values.centerZ}
                  onChange={(event) => update("centerZ", event.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("worldChunks.filter.mode")}</Label>
            <div className="flex gap-1">
              {MODES.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={mode === entry}
                  onClick={() => setMode(entry)}
                  className="rounded-md bg-surface-3 px-2 py-1 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary-soft-raised aria-pressed:text-foreground"
                >
                  {t(`worldChunks.filter.modes.${entry}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.65rem] text-faint">
              {matched === null
                ? t("worldChunks.filter.scannedOnly")
                : t("worldChunks.filter.matched", { count: matched })}
            </span>
            <Button size="sm" className="h-7" onClick={apply}>
              {t("worldChunks.filter.apply")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
