import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { FolderOpen, Loader2, Package, PackagePlus, Trash } from "lucide-react";
import { IWorld } from "@/types/World";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@renderer/components/Hint";
import { settingsAtom } from "@renderer/stores/atoms";
import { toFileUrl } from "@renderer/utilities/exportVersion";
import { showFailureToast } from "@renderer/utilities/failures";
import { toast } from "sonner";
import { DatapackOption } from "./useWorldsData";
import { splitDatapacks } from "./worldFacts";

const api = window.api;

export function WorldDatapacksTab({
  world,
  options,
  disabled,
  onChange,
}: {
  world: IWorld;
  options: DatapackOption[];
  disabled: boolean;
  onChange: (datapacks: string[]) => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const installed = useMemo(
    () =>
      splitDatapacks(
        world.datapacks,
        world.enabledDatapacks,
        world.disabledDatapacks,
      ),
    [world.datapacks, world.enabledDatapacks, world.disabledDatapacks],
  );

  const installedSet = useMemo(
    () => new Set(world.datapacks),
    [world.datapacks],
  );

  const selected = options.find((option) => option.filename === picked);

  const titleOf = (filename: string) =>
    options.find((option) => option.filename === filename)?.mod.title ?? null;

  const add = async (option: DatapackOption) => {
    if (installedSet.has(option.filename)) return;

    setBusy(option.filename);

    try {
      const targetPath = api.path.join(
        world.path,
        "datapacks",
        option.filename,
      );

      let sourcePath = option.path;

      if (!(await api.fs.pathExists(sourcePath))) {
        if (!option.file.url || option.file.url.startsWith("blocked::")) {
          toast.error(t("worlds.datapackUnavailable"));
          return;
        }

        await api.fs.ensure(api.path.join(option.path, ".."));
        await api.file.download(
          [
            {
              destination: option.path,
              group: "mods",
              url: option.file.localPath
                ? toFileUrl(option.file.localPath)
                : option.file.url,
              sha1: option.file.sha1,
              size: option.file.size,
            },
          ],
          settings.downloadLimit,
        );

        sourcePath = option.path;
      }

      if (!(await api.fs.pathExists(sourcePath))) {
        toast.error(t("worlds.datapackUnavailable"));
        return;
      }

      if (!(await api.fs.copy(sourcePath, targetPath))) {
        showFailureToast(t("worlds.datapackAddError"), undefined, {
          channels: ["fs:copy"],
        });
        return;
      }

      onChange([...world.datapacks, option.filename]);
      setPicked("");
      toast.success(t("worlds.datapackAdded"));
    } catch (error) {
      showFailureToast(t("worlds.datapackAddError"), error, {
        channels: ["fs:", "file:download"],
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (filename: string) => {
    setBusy(filename);

    try {
      const removed = await api.shell.trashItem(
        api.path.join(world.path, "datapacks", filename),
      );

      if (!removed) {
        showFailureToast(t("worlds.datapackRemoveError"), undefined, {
          channels: ["shell:trashItem"],
        });
        return;
      }

      onChange(world.datapacks.filter((entry) => entry !== filename));
    } catch (error) {
      showFailureToast(t("worlds.datapackRemoveError"), error, {
        channels: ["fs:"],
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={picked}
          disabled={disabled || !options.length}
          onValueChange={(value) => setPicked(value || "")}
        >
          <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
            <SelectValue
              placeholder={
                options.length
                  ? t("worlds.datapackPick")
                  : t("worlds.datapackNoSource")
              }
            />
          </SelectTrigger>
          <SelectContent position="popper">
            {options.map((option) => (
              <SelectItem
                key={`${option.filename}:${option.mod.id}`}
                value={option.filename}
                disabled={installedSet.has(option.filename)}
              >
                <span className="flex min-w-0 max-w-80 items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border bg-surface-3 text-faint">
                    {option.mod.iconUrl ? (
                      <img
                        src={option.mod.iconUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="size-3" />
                    )}
                  </span>
                  <span className="min-w-0 truncate">{option.mod.title}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          disabled={disabled || !selected || busy !== null}
          onClick={() => selected && void add(selected)}
        >
          {busy === picked && picked ? (
            <Loader2 className="animate-spin" />
          ) : (
            <PackagePlus className="size-3.5" />
          )}
          {t("worlds.datapackAdd")}
        </Button>

        <Hint content={t("worlds.openDatapacksFolder")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t("worlds.openDatapacksFolder")}
            onClick={async () => {
              try {
                const folder = api.path.join(world.path, "datapacks");
                await api.fs.ensure(folder);
                await api.shell.openPath(folder);
              } catch (error) {
                showFailureToast(t("worlds.openDatapacksFolderError"), error, {
                  channels: ["fs:", "shell:"],
                });
              }
            }}
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </Hint>
      </div>

      {installed.length === 0 ? (
        <Empty className="min-h-0 flex-1 border border-dashed border-border bg-surface-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle>{t("worlds.noDatapacks")}</EmptyTitle>
            <EmptyDescription>{t("worlds.noDatapacksHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-surface-1">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            <span>{t("worlds.datapacksInWorld")}</span>
            <span className="font-mono text-faint">{installed.length}</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {installed.map((entry) => {
              const title = titleOf(entry.name);

              return (
                <div
                  key={entry.name}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-accent/30"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-surface-3 text-faint">
                    <Package className="size-3.5" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <Hint
                      content={title ?? entry.name}
                      variant="text"
                      truncatedOnly
                    >
                      <span className="truncate text-xs font-medium">
                        {title ?? entry.name}
                      </span>
                    </Hint>
                    {title && (
                      <Hint content={entry.name} variant="text" truncatedOnly>
                        <span className="truncate font-mono text-[0.65rem] text-faint">
                          {entry.name}
                        </span>
                      </Hint>
                    )}
                  </div>

                  <Hint
                    content={
                      entry.state === "unknown"
                        ? t("worlds.datapackPendingHint")
                        : undefined
                    }
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] ${
                        entry.state === "enabled"
                          ? "bg-success/15 text-success"
                          : entry.state === "unknown"
                            ? "bg-warning/15 text-warning"
                            : "bg-surface-3 text-muted-foreground"
                      }`}
                    >
                      {t(`worlds.datapackState.${entry.state}`)}
                    </span>
                  </Hint>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={disabled || busy !== null}
                    aria-label={t("common.delete")}
                    onClick={() => void remove(entry.name)}
                  >
                    {busy === entry.name ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash className="size-3.5" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
