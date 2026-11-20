import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Coffee, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { versionsAtom } from "@renderer/stores/atoms";
import { Hint } from "@renderer/components/Hint";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import {
  SettingRow,
  SettingsGroup,
} from "@renderer/features/settings/SettingsPrimitives";
import type { JavaRuntimeInfo } from "@/shared/javaRuntime";
import { findRuntime, javaMajors, minecraftRangeKey } from "./javaChoices";
import { JavaPicker } from "./JavaPicker";
import { useJavaRuntimes } from "./useJavaRuntimes";
import { useGameLockReason } from "@renderer/features/settings/gameLock";

function runtimeName(runtime: Pick<JavaRuntimeInfo, "vendor" | "version">) {
  return [runtime.vendor, runtime.version].filter(Boolean).join(" ") || "Java";
}

function SourceChip({ source }: { source: JavaRuntimeInfo["source"] }) {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-1.5 py-px text-3xs leading-4",
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
      <Hint content={runtimeName(runtime)} variant="text" truncatedOnly>
        <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
          {runtimeName(runtime)}
        </span>
      </Hint>
      <Hint content={shownPath} variant="text" truncatedOnly>
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-3xs text-faint",
            redact.active && "streamer-mask",
          )}
        >
          {shownPath}
        </span>
      </Hint>
      {runtime.missing ? (
        <span className="shrink-0 text-2xs text-warning">
          {t("java.missing")}
        </span>
      ) : chosenFor !== null ? (
        <span className="shrink-0 text-2xs text-success">
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
  const lockedReason = useGameLockReason();
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
    <SettingsGroup
      entry="java"
      title={t("java.title")}
      hint={t("java.hint")}
      lockedReason={lockedReason}
    >
      {majors.map((major) => {
        const chosen = list?.defaults[String(major)] ?? null;

        return (
          <SettingRow
            key={major}
            title={`Java ${major}`}
            description={t(`java.range.${minecraftRangeKey(major)}`)}
            query={query}
            changed={Boolean(chosen)}
            onReset={() => void setDefault(major, null)}
            control={
              <JavaPicker
                lockMajor
                value={chosen ? { home: chosen } : undefined}
                requiredMajor={major}
                disabled={!list}
                className="h-8 w-60 text-sm"
                onChange={(next) =>
                  void setDefault(
                    major,
                    next && "home" in next ? next.home : null,
                  )
                }
              />
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
