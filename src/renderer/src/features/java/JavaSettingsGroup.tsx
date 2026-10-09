import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Coffee, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { versionsAtom } from "@renderer/stores/atoms";
import { Hint } from "@renderer/components/Hint";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import {
  SettingRow,
  SettingsGroup,
} from "@renderer/features/settings/SettingsPrimitives";
import type { JavaRuntimeInfo } from "@/shared/javaRuntime";
import {
  findRuntime,
  installedRuntimes,
  javaMajors,
  managedRuntime,
  minecraftRangeKey,
} from "./javaChoices";
import { useJavaRuntimes } from "./useJavaRuntimes";

const AUTO = "auto";

function runtimeName(runtime: Pick<JavaRuntimeInfo, "vendor" | "version">) {
  return [runtime.vendor, runtime.version].filter(Boolean).join(" ") || "Java";
}

function SourceChip({ source }: { source: JavaRuntimeInfo["source"] }) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-1.5 py-px text-[0.65rem] leading-4",
        source === "custom"
          ? "border-border bg-surface-3 text-foreground"
          : "border-border/70 text-faint",
      )}
    >
      {t(`java.source.${source}`)}
    </span>
  );
}

function RuntimeRow({
  runtime,
  chosenFor,
  onRemove,
}: {
  runtime: JavaRuntimeInfo;
  chosenFor: number | null;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const redact = useRedact();
  const shownPath = redact.path(runtime.home);

  return (
    <div className="flex h-9 items-center gap-2.5 px-2.5">
      <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-foreground">
        Java {runtime.major}
      </span>
      <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
        {runtimeName(runtime)}
      </span>
      <Hint content={shownPath} variant="text" truncatedOnly>
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[0.65rem] text-faint",
            redact.active && "streamer-mask",
          )}
        >
          {shownPath}
        </span>
      </Hint>
      {runtime.missing ? (
        <span className="shrink-0 text-[0.7rem] text-warning">
          {t("java.missing")}
        </span>
      ) : chosenFor !== null ? (
        <span className="shrink-0 text-[0.7rem] text-success">
          {t("java.chosenFor", { major: chosenFor })}
        </span>
      ) : null}
      <SourceChip source={runtime.source} />
      {onRemove ? (
        <Hint content={t("java.remove")}>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-faint"
            aria-label={t("java.remove")}
            onClick={onRemove}
          >
            <X />
          </Button>
        </Hint>
      ) : (
        <span className="size-6 shrink-0" />
      )}
    </div>
  );
}

export function JavaSettingsGroup({ query }: { query: string }) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const { list, scanning, add, remove, setDefault, refresh } = useJavaRuntimes();

  const majors = useMemo(
    () =>
      javaMajors(
        list,
        versions.map(
          (version) => version.java?.requiredMajor ?? version.javaMajorVersion,
        ),
      ),
    [list, versions],
  );

  const runtimes = list?.runtimes ?? [];
  const chosenMajor = (runtime: JavaRuntimeInfo) => {
    const entry = Object.entries(list?.defaults ?? {}).find(
      ([, home]) => findRuntime(list, home) === runtime,
    );
    return entry ? Number(entry[0]) : null;
  };

  return (
    <SettingsGroup title={t("java.title")} hint={t("java.hint")}>
      {majors.map((major) => {
        const chosen = list?.defaults[String(major)] ?? null;
        const chosenRuntime = chosen ? findRuntime(list, chosen) : null;
        const candidates = installedRuntimes(list).filter(
          (runtime) => runtime.major === major,
        );
        const managed = managedRuntime(list, major);

        return (
          <SettingRow
            key={major}
            title={`Java ${major}`}
            description={t(`java.range.${minecraftRangeKey(major)}`)}
            query={query}
            changed={Boolean(chosen)}
            onReset={() => void setDefault(major, null)}
            control={
              <Select
                value={chosen ?? AUTO}
                disabled={!list}
                onValueChange={(value) =>
                  void setDefault(major, value === AUTO ? null : value)
                }
              >
                <SelectTrigger size="sm" className="w-60">
                  <SelectValue>
                    {chosen ? (
                      chosenRuntime && !chosenRuntime.missing ? (
                        runtimeName(chosenRuntime)
                      ) : (
                        <span className="text-warning">{t("java.missing")}</span>
                      )
                    ) : (
                      <>
                        {t("java.auto")}
                        {managed?.vendor && (
                          <span className="text-faint"> · {managed.vendor}</span>
                        )}
                      </>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value={AUTO}>
                    <span>{t("java.auto")}</span>
                    <span className="text-faint">
                      {managed
                        ? runtimeName(managed)
                        : t("java.downloadsOnLaunch")}
                    </span>
                  </SelectItem>
                  {candidates.map((runtime) => (
                    <SelectItem key={runtime.home} value={runtime.home}>
                      <span>{runtimeName(runtime)}</span>
                      <span className="text-faint">
                        {t(`java.source.${runtime.source}`)}
                      </span>
                    </SelectItem>
                  ))}
                  {chosen && (!chosenRuntime || chosenRuntime.missing) && (
                    <SelectItem value={chosen} disabled>
                      <span>{t("java.missing")}</span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            }
          />
        );
      })}

      <SettingRow
        title={t("java.installedTitle")}
        description={t("java.installedDescription")}
        query={query}
        control={
          <div className="flex items-center gap-1.5">
            <Hint content={t("java.rescan")}>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                aria-label={t("java.rescan")}
                disabled={scanning}
                onClick={() => void refresh()}
              >
                <RefreshCw className={cn(scanning && "animate-spin")} />
              </Button>
            </Hint>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void add()}
            >
              <Plus />
              {t("java.add")}
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-surface-2">
          {!list && scanning ? (
            <p className="flex h-9 items-center gap-2 px-2.5 text-xs text-faint">
              <Loader2 className="size-3.5 animate-spin" />
              {t("java.scanning")}
            </p>
          ) : runtimes.length === 0 ? (
            <p className="flex h-9 items-center gap-2 px-2.5 text-xs text-faint">
              <Coffee className="size-3.5" />
              {t("java.empty")}
            </p>
          ) : (
            runtimes.map((runtime) => (
              <RuntimeRow
                key={`${runtime.source}:${runtime.home}`}
                runtime={runtime}
                chosenFor={chosenMajor(runtime)}
                onRemove={
                  runtime.source === "custom"
                    ? () => void remove(runtime.home)
                    : undefined
                }
              />
            ))
          )}
        </div>
      </SettingRow>
    </SettingsGroup>
  );
}
