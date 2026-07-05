import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IServerConf, IServerOption } from "@/types/Server";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import {
  accountAtom,
  installActiveAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { HardDriveDownload, Loader2, ServerCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServerGame } from "@renderer/classes/ServerGame";
import { Mods } from "@renderer/classes/Mods";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const api = window.api;

export function CreateServer({
  close,
  serverCores,
}: {
  close: (isSuccess?: boolean) => void;
  serverCores: IServerOption[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"install">();
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const [account] = useAtom(accountAtom);
  const { t } = useTranslation();
  const [, setServer] = useAtom(serverAtom);
  const [settings] = useAtom(settingsAtom);
  const [isInstallActive] = useAtom(installActiveAtom);
  const [progressStarted, setProgressStarted] = useState(false);

  const [selectedCore, setSelectedCore] = useState<string | null>(
    serverCores[0]?.core ?? null,
  );
  const [memory, setMemory] = useState(() =>
    selectedVersion?.version.loader.name == "vanilla" ? 2048 : 4096,
  );

  const selectedServerCore = useMemo(() => {
    return selectedCore
      ? serverCores.find((sc) => sc.core === selectedCore)
      : undefined;
  }, [selectedCore, serverCores]);

  useEffect(() => {
    if (!selectedCore && serverCores.length) {
      setSelectedCore(serverCores[0].core);
    }
  }, [serverCores, selectedCore]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading) setProgressStarted(false);
    else if (isInstallActive) setProgressStarted(true);
  }, [isLoading, isInstallActive]);

  const canInstall = !!selectedVersion && !!selectedServerCore && !!account;

  const handleInstall = useCallback(async () => {
    if (isLoading || isInstallActive) return;
    if (!selectedVersion || !selectedServerCore || !account) return;

    const versionPath = selectedVersion.versionPath;

    setLoadingType("install");
    setIsLoading(true);

    let success = false;

    try {
      const serverPath = await api.path.join(versionPath, "server");
      await api.fs.ensure(serverPath);

      const conf: IServerConf = {
        core: selectedServerCore.core,
        javaMajorVersion:
          selectedVersion.manifest?.javaVersion?.majorVersion ??
          mcVersionToJavaMajor(selectedVersion.version.version.id),
        memory,
        downloads: {
          server: selectedServerCore.url,
        },
      };

      await api.file.download(
        [
          {
            url: selectedServerCore.url,
            destination: await api.path.join(
              serverPath,
              selectedServerCore.core + ".jar",
            ),
            group: "server",
          },
        ],
        settings.downloadLimit,
      );

      const serverGame = new ServerGame(
        account,
        settings.downloadLimit,
        versionPath,
        serverPath,
        conf,
        selectedVersion.version,
      );

      const hasMods = selectedVersion.version.loader.mods.length > 0;

      await serverGame.install({ keepProgressOpen: hasMods });

      await api.fs.writeJSON(
        await api.path.join(serverPath, "conf.json"),
        conf,
      );

      setServer(conf);

      await api.fs.writeFile(
        await api.path.join(serverPath, "eula.txt"),
        "eula=true",
        "utf-8",
      );

      if (hasMods) {
        const mods = new Mods(settings, selectedVersion.version, conf);
        await mods.check({ operation: "server" });
      }

      toast.success(t("versions.serverInstalled"));

      success = true;
    } catch (err) {
      console.error(err);

      const message = err instanceof Error ? err.message : String(err);
      showErrorToast(
        t("versions.serverInstallError"),
        message,
        t("common.copy"),
      );
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setLoadingType(undefined);
      }
    }

    if (success) close(true);
  }, [
    isLoading,
    isInstallActive,
    selectedVersion,
    selectedServerCore,
    account,
    settings.downloadLimit,
    setServer,
    close,
    t,
    settings,
    memory,
  ]);

  return (
    <Dialog
      open={!(isLoading && progressStarted)}
      onOpenChange={(open) => {
        if (!open && !isLoading) close();
      }}
    >
      <DialogContent aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-xs"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ServerCog className="size-5" />
            {t("versions.createingServer")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 px-5 pb-5">
          {serverCores.length ? (
            <div className="grid gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {t("versions.serverCore")}
              </span>
              <Select
                value={selectedCore ?? serverCores[0]?.core ?? ""}
                disabled={isLoading}
                onValueChange={(value) => {
                  setSelectedCore(value || null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("versions.serverCore")} />
                </SelectTrigger>
                <SelectContent>
                  {serverCores.map((sc) => {
                    return (
                      <SelectItem key={sc.core} value={sc.core}>
                        {sc.core}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : undefined}

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium text-muted-foreground">
                {t("settings.memory")}
              </Label>
              <Badge variant="secondary" className="tabular-nums">
                {memory} {t("settings.mb")}
              </Badge>
            </div>
            <Slider
              step={512}
              min={1024}
              max={16384}
              value={[memory]}
              disabled={isLoading}
              onValueChange={([value]) => {
                if (typeof value == "number") setMemory(value);
              }}
            />
          </div>
        </div>
        <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
          <Button
            disabled={!canInstall || isLoading || isInstallActive}
            onClick={handleInstall}
          >
            {isLoading && loadingType == "install" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <HardDriveDownload className="size-5" />
            )}
            {t("common.install")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
