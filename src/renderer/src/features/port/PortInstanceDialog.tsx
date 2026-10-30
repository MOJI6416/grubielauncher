import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  CircleAlert,
  Loader2,
  RotateCw,
  Search,
} from "lucide-react";
import type { Loader } from "@/types/Loader";
import type { IVersion } from "@/types/IVersion";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import type { Version } from "@renderer/classes/Version";
import { LoaderLabel, getLoaderInfo } from "@renderer/components/Loaders";
import { instanceKey } from "@renderer/features/instances/selectors";
import { INSTANCE_FOLDER_EXISTS } from "@renderer/features/newInstance/createInstance";
import {
  checkInstanceName,
  instanceNameMessage,
  suggestInstanceName,
} from "@renderer/features/newInstance/nameValidation";
import { useInstanceFolderNames } from "@renderer/features/newInstance/useInstanceFolders";
import { versionKind } from "@renderer/features/newInstance/versionCatalog";
import { navigate } from "@renderer/navigation/navigate";
import { versionsAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { analyzePort } from "./analyzePort";
import type { PortItem } from "./portPlan";
import { PortPreview } from "./PortPreview";
import { PORT_VERSION_FAILED, runPort } from "./runPort";

const api = window.api;

const TARGET_LOADERS: Loader[] = ["fabric", "quilt", "forge", "neoforge"];

function suggestedName(
  source: Version,
  minecraftVersion: string,
  loader: Loader,
): string {
  const own = source.version.name;
  const from = source.version.version.id;

  if (!minecraftVersion || minecraftVersion === from) {
    return `${own} ${getLoaderInfo(loader).name}`;
  }

  return own.includes(from)
    ? own.replace(from, minecraftVersion)
    : `${own} ${minecraftVersion}`;
}

export function PortInstanceDialog({
  source,
  onClose,
}: {
  source: Version;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const instances = useAtomValue(versionsAtom);
  const folderNames = useInstanceFolderNames();
  const sourceLoader = source.version.loader.name;
  const sourceVersion = source.version.version.id;

  const [loader, setLoader] = useState<Loader>(
    TARGET_LOADERS.includes(sourceLoader) ? sourceLoader : "fabric",
  );
  const [versions, setVersions] = useState<IVersion[]>([]);
  const [versionsFailed, setVersionsFailed] = useState(false);
  const [minecraftVersion, setMinecraftVersion] = useState("");
  const [name, setName] = useState("");
  const [isNameEdited, setIsNameEdited] = useState(false);
  const [copySettings, setCopySettings] = useState(true);
  const [copyWorlds, setCopyWorlds] = useState(false);
  const [items, setItems] = useState<PortItem[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const checkRef = useRef(0);

  const instanceNames = useMemo(
    () => instances.map((instance) => instance.version.name),
    [instances],
  );

  useEffect(() => {
    let cancelled = false;
    setVersions([]);
    setVersionsFailed(false);

    api.versions
      .getList(loader, false)
      .then((list) => {
        if (cancelled) return;
        const releases = (list ?? []).filter(
          (item) => versionKind(item.type) === "release",
        );
        setVersions(releases);
        setVersionsFailed(releases.length === 0);
        setMinecraftVersion((previous) =>
          releases.some((item) => item.id === previous)
            ? previous
            : (releases[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!cancelled) setVersionsFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loader]);

  useEffect(() => {
    if (isNameEdited) return;
    setName(
      suggestInstanceName(suggestedName(source, minecraftVersion, loader), [
        ...instanceNames,
        ...folderNames,
      ]),
    );
  }, [folderNames, instanceNames, isNameEdited, loader, minecraftVersion, source]);

  useEffect(() => {
    checkRef.current += 1;
    setItems(null);
    setCheckFailed(false);
    setIsChecking(false);
  }, [loader, minecraftVersion, copyWorlds]);

  const nameCheck = useMemo(
    () => checkInstanceName(name, instanceNames, folderNames),
    [folderNames, instanceNames, name],
  );
  const nameIssue =
    nameCheck.issue && nameCheck.issue !== "empty"
      ? instanceNameMessage(nameCheck, t)
      : null;

  const isSameTarget =
    minecraftVersion === sourceVersion && loader === sourceLoader;
  const target = `${minecraftVersion} ${getLoaderInfo(loader).name}`;

  const runCheck = async () => {
    const requestId = ++checkRef.current;
    setIsChecking(true);
    setCheckFailed(false);

    try {
      const result = await analyzePort(
        source.versionPath,
        source.version.loader.mods ?? [],
        { minecraftVersion, loader },
        { includeWorlds: copyWorlds },
      );
      if (requestId !== checkRef.current) return;
      setItems(result);
    } catch {
      if (requestId !== checkRef.current) return;
      setCheckFailed(true);
    } finally {
      if (requestId === checkRef.current) setIsChecking(false);
    }
  };

  const create = () => {
    if (!items || !nameCheck.ok) return;

    const portName = name.trim();
    const portTarget = { minecraftVersion, loader };
    onClose();

    const toastId = toast.loading(t("port.creating", { name: portName }));

    void runPort(source, portTarget, items, {
      name: portName,
      copySettings,
      copyWorlds,
    })
      .then(({ instance, blocked, copyFailed }) => {
        const notes = [
          blocked.length > 0
            ? t("port.blocked", { names: blocked.join(", ") })
            : "",
          copyFailed ? t("port.copyFailed") : "",
        ].filter(Boolean);

        toast.success(t("port.created", { name: instance.version.name }), {
          id: toastId,
          description: notes.length > 0 ? notes.join(" ") : undefined,
        });
        navigate({ name: "instance", id: instanceKey(instance) });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message === VERSION_INSTALL_CANCELLED) {
          toast.info(t("newInstance.installCancelled"), { id: toastId });
        } else if (message === INSTANCE_FOLDER_EXISTS) {
          toast.error(t("newInstance.name.folderTaken"), { id: toastId });
        } else if (message === PORT_VERSION_FAILED) {
          toast.error(t("port.versionFailed"), { id: toastId });
        } else {
          showFailureToast(t("versions.installError"), error, { toastId });
        }
      });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <ArrowRightLeft className="size-5 shrink-0" />
            <span className="truncate">
              {t("port.title", { name: source.version.name })}
            </span>
          </DialogTitle>
          <DialogDescription>{t("port.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>{t("port.minecraftVersion")}</Label>
              <VirtualizedSelect
                size="sm"
                aria-label={t("port.minecraftVersion")}
                value={minecraftVersion}
                placeholder={
                  versionsFailed
                    ? t("port.versionsFailed")
                    : t("versions.version")
                }
                searchPlaceholder={t("common.search")}
                emptyText={t("common.notFound")}
                disabled={isChecking || versions.length === 0}
                options={versions.map((item) => ({
                  value: item.id,
                  label: item.id,
                  secondaryLabel:
                    item.id === sourceVersion ? t("port.current") : undefined,
                }))}
                onValueChange={setMinecraftVersion}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>{t("port.loader")}</Label>
              <Select
                value={loader}
                disabled={isChecking}
                onValueChange={(value: Loader) => setLoader(value)}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  aria-label={t("port.loader")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LOADERS.map((item) => (
                    <SelectItem key={item} value={item}>
                      <LoaderLabel loader={item} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="port-name">{t("port.name")}</Label>
            <Input
              id="port-name"
              value={name}
              className="h-8"
              onChange={(event) => {
                setIsNameEdited(true);
                setName(event.target.value);
              }}
            />
            {nameIssue && (
              <p className="text-xs text-destructive">{nameIssue}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={copySettings}
                onCheckedChange={(value) => setCopySettings(value === true)}
              />
              {t("port.copySettings")}
            </label>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={copyWorlds}
                onCheckedChange={(value) => setCopyWorlds(value === true)}
              />
              {t("port.copyWorlds")}
            </label>
            {copyWorlds && (
              <p className="pl-6 text-xs text-muted-foreground">
                {t("port.copyWorldsHint")}
              </p>
            )}
          </div>

          {isSameTarget ? (
            <p className="text-xs text-muted-foreground">
              {t("port.sameTarget", { action: t("versions.duplicate") })}
            </p>
          ) : isChecking ? (
            <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("port.checking", { target })}
            </p>
          ) : checkFailed ? (
            <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="size-3.5 shrink-0" />
              {t("port.checkFailed")}
            </p>
          ) : items ? (
            <PortPreview
              items={items}
              target={target}
              emptyText={t("port.nothingToCheck")}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {items ? (
            <Button disabled={!nameCheck.ok} onClick={create}>
              <ArrowRightLeft />
              {t("port.create")}
            </Button>
          ) : (
            <Button
              disabled={!minecraftVersion || isChecking || isSameTarget}
              onClick={() => void runCheck()}
            >
              {isChecking ? (
                <Loader2 className="animate-spin" />
              ) : checkFailed ? (
                <RotateCw />
              ) : (
                <Search />
              )}
              {t(checkFailed ? "common.retry" : "port.check")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
