import { ILocalProject } from "@/types/ModManager";
import { IWorld } from "@/types/World";
import { settingsAtom } from "@renderer/stores/atoms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Folder, Loader2, Package, PackagePlus, Trash } from "lucide-react";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const api = window.api;

type DatapackOption = {
  mod: ILocalProject;
  file: NonNullable<ILocalProject["version"]>["files"][number];
  path: string;
  filename: string;
  isDownloaded: boolean;
};

export function Datapacks({
  onClose,
  world,
  datapacks,
}: {
  onClose: () => void;
  world: IWorld;
  datapacks: DatapackOption[];
}) {
  const [datapackName, setDatapackName] = useState<string>("");
  const [worldDatapacks, setWorldDatapacks] = useState<string[]>(() => [
    ...world.datapacks,
  ]);
  const [addingFilename, setAddingFilename] = useState<string | null>(null);
  const [settings] = useAtom(settingsAtom);

  const { t } = useTranslation();

  useEffect(() => {
    setWorldDatapacks([...world.datapacks]);
  }, [world]);

  const availableDatapacks = useMemo(() => {
    const byFilename = new Map<string, DatapackOption>();

    for (const datapack of datapacks) {
      byFilename.set(datapack.filename, datapack);
    }

    return [...byFilename.values()];
  }, [datapacks]);

  const disabledKeys = useMemo(() => new Set(worldDatapacks), [worldDatapacks]);

  const selectedDatapack = useMemo(() => {
    return availableDatapacks.find((dp) => dp.filename === datapackName);
  }, [availableDatapacks, datapackName]);

  const isInstalled = useMemo(() => {
    return datapackName ? worldDatapacks.includes(datapackName) : false;
  }, [datapackName, worldDatapacks]);

  async function addDatapack(datapack: DatapackOption) {
    if (disabledKeys.has(datapack.filename) || addingFilename) return false;

    const targetPath = await api.path.join(
      world.path,
      "datapacks",
      datapack.filename,
    );

    setAddingFilename(datapack.filename);

    try {
      let sourcePath = datapack.path;
      const sourceExists = await api.fs.pathExists(sourcePath);

      if (!sourceExists) {
        if (!datapack.file.url || datapack.file.url.startsWith("blocked::")) {
          toast.error(t("worlds.datapackUnavailable"));
          return false;
        }

        await api.fs.ensure(await api.path.join(datapack.path, ".."));
        await api.file.download(
          [
            {
              destination: datapack.path,
              group: "mods",
              url: datapack.file.localPath
                ? `file://${datapack.file.localPath}`
                : datapack.file.url,
              sha1: datapack.file.sha1,
              size: datapack.file.size,
            },
          ],
          settings.downloadLimit,
        );

        sourcePath = datapack.path;
      }

      if (!(await api.fs.pathExists(sourcePath))) {
        toast.error(t("worlds.datapackUnavailable"));
        return false;
      }

      await api.fs.copy(sourcePath, targetPath);

      setWorldDatapacks((prev) => {
        if (prev.includes(datapack.filename)) return prev;
        return [...prev, datapack.filename];
      });

      if (!world.datapacks.includes(datapack.filename)) {
        world.datapacks.push(datapack.filename);
      }

      return true;
    } catch (err) {
      console.error(err);
      toast.error(t("worlds.datapackAddError"));
      return false;
    } finally {
      setAddingFilename(null);
    }
  }

  function DatapackIcon({
    datapack,
    className = "size-6",
  }: {
    datapack?: DatapackOption;
    className?: string;
  }) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30 text-muted-foreground ${className}`}
      >
        {datapack?.mod.iconUrl ? (
          <img
            src={datapack.mod.iconUrl}
            alt={datapack.mod.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <Package className="size-3.5" />
        )}
      </span>
    );
  }

  function DatapackItem({ fileName }: { fileName: string }) {
    const pack = availableDatapacks.find((dp) => dp.filename === fileName);
    const title = pack?.mod.title || fileName;

    return (
      <Card className="min-w-0 max-w-full gap-0 overflow-hidden py-0 shadow-none">
        <CardContent className="min-w-0 max-w-full overflow-hidden p-3">
          <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                {pack?.mod.iconUrl ? (
                  <img
                    src={pack.mod.iconUrl}
                    width={36}
                    height={36}
                    className="h-full w-full object-cover"
                    alt={pack.mod.title}
                  />
                ) : (
                  <Package className="size-4" />
                )}
              </div>
              <div className="min-w-0 overflow-hidden">
                <p
                  className="block max-w-full truncate text-sm font-medium text-foreground"
                  title={title}
                >
                  {title}
                </p>
                <p
                  className="block max-w-full truncate text-xs text-muted-foreground"
                  title={fileName}
                >
                  {fileName}
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="icon-sm"
              className="shrink-0"
              onClick={async () => {
                try {
                  const targetPath = await api.path.join(
                    world.path,
                    "datapacks",
                    fileName,
                  );
                  await api.fs.rimraf(targetPath);

                  setWorldDatapacks((prev) =>
                    prev.filter((dp) => dp !== fileName),
                  );
                  world.datapacks = world.datapacks.filter(
                    (dp) => dp !== fileName,
                  );
                } catch (err) {
                  console.error(err);
                  toast.error(t("worlds.datapackRemoveError"));
                }
              }}
            >
              <Trash />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-md"
        onInteractOutside={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;

          if (
            target.closest(
              '[data-slot="select-content"], [data-radix-popper-content-wrapper]',
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="border-b py-4 pr-12 pl-5">
          <DialogTitle>{t("worlds.datapacks")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-5 pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <Select
              disabled={!availableDatapacks.length}
              value={datapackName}
              onValueChange={(value) => setDatapackName(value || "")}
            >
              <SelectTrigger className="min-w-0 flex-1">
                {selectedDatapack ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <DatapackIcon datapack={selectedDatapack} />
                    <span className="min-w-0 truncate">
                      {selectedDatapack.mod.title}
                    </span>
                  </span>
                ) : (
                  <SelectValue placeholder={t("worlds.datapacks")} />
                )}
              </SelectTrigger>
              <SelectContent position="popper">
                {availableDatapacks.map((dp) => (
                  <SelectItem
                    key={`${dp.filename}:${dp.mod.id}`}
                    value={dp.filename}
                    disabled={disabledKeys.has(dp.filename)}
                  >
                    <span className="flex min-w-0 max-w-80 items-center gap-2">
                      <DatapackIcon datapack={dp} />
                      <span className="min-w-0 truncate">{dp.mod.title}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              disabled={
                !selectedDatapack || isInstalled || Boolean(addingFilename)
              }
              size="icon"
              onClick={async () => {
                if (!selectedDatapack) return;
                const added = await addDatapack(selectedDatapack);
                if (added) setDatapackName("");
              }}
            >
              {addingFilename === datapackName ? (
                <Loader2 className="animate-spin" />
              ) : (
                <PackagePlus />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={async () => {
                try {
                  const datapacksPath = await api.path.join(
                    world.path,
                    "datapacks",
                  );
                  await api.fs.ensure(datapacksPath);
                  await api.shell.openPath(datapacksPath);
                } catch (err) {
                  console.error(err);
                  toast.error(t("worlds.openDatapacksFolderError"));
                }
              }}
            >
              <Folder />
            </Button>
          </div>

          {worldDatapacks.length > 0 ? (
            <ScrollArea className="h-72">
              <div className="flex min-w-0 flex-col gap-2 pr-3">
                {worldDatapacks.map((d) => (
                  <DatapackItem fileName={d} key={d} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Empty className="min-h-52 border border-dashed bg-muted/20">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>{t("worlds.noDatapacks")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
