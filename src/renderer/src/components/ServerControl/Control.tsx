import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageCropper } from "../ImageCropper";
import { ServerSettings } from "./Settings";
import { ProjectType } from "@/types/ModManager";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  Folder,
  ImagePlus,
  Play,
  ServerCog,
  Settings,
  Square,
  Trash,
  TriangleAlert,
  X,
} from "lucide-react";
import { useAtom } from "jotai";
import { selectedVersionAtom, serverAtom } from "@renderer/stores/atoms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Confirmation } from "../Modals/Confirmation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ServerRunState } from "@/types/Server";
import { getServerRuntime } from "./serverRuntime";

import { showFailureToast } from "@renderer/utilities/failures";
enum LoadingType {
  RUN = "run",
  DELETE = "delete",
}

const MAX_SERVER_LOG_LINES = 300;

const RUN_ERROR_KEYS: Record<string, string> = {
  server_run_script_untrusted: "serverManager.runErrorUntrusted",
  server_not_managed: "serverManager.runErrorNotManaged",
};

function isSameServerPath(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

const api = window.api;

export function ServerControl({
  onClose,
  onDelete,
}: {
  onClose: () => void;
  onDelete: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<LoadingType | null>(null);
  const [isSettings, setIsSettings] = useState(false);
  const [image, setImage] = useState("");
  const [isCropping, setIsCropping] = useState(false);
  const [serverLogo, setServerLogo] = useState("");
  const [server] = useAtom(serverAtom);
  const [version] = useAtom(selectedVersionAtom);
  const [serverPath, setServerPath] = useState("");
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [runState, setRunState] = useState<ServerRunState>("stopped");
  const [runLog, setRunLog] = useState<string[]>([]);

  const runtime = useMemo(() => getServerRuntime(), []);
  const logoUrlRef = useRef<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const { t } = useTranslation();

  function setLogoUrl(url: string) {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    logoUrlRef.current = null;
    setServerLogo(url);
  }

  function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  async function changeImage(blob: Blob) {
    if (!server || !serverPath) return;

    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);

    const iconPath = await api.path.join(serverPath, "server-icon.png");
    await api.fs.writeFile(iconPath, base64, "base64");

    setLogoUrl(`data:image/png;base64,${base64}`);
    setIsCropping(false);
    toast.success(t("serverManager.logoEdited"));
  }

  const openLogoPicker = useCallback(async () => {
    const filePaths = await api.other.openFileDialog();
    if (!filePaths || filePaths.length === 0) return;

    setImage(filePaths[0]);
    setIsCropping(true);
  }, []);

  const deleteLogo = useCallback(async () => {
    if (!serverPath || !serverLogo) return;

    await api.fs.rimraf(await api.path.join(serverPath, "server-icon.png"));

    setLogoUrl("");
  }, [serverPath, serverLogo]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!version?.versionPath) return;

      const sp = await api.path.join(version.versionPath, "server");

      if (cancelled) return;
      setServerPath(sp);

      if (!server) {
        setLogoUrl("");
        return;
      }

      const logoPath = await api.path.join(sp, "server-icon.png");
      const isExists = await api.fs.pathExists(logoPath);

      if (!isExists) {
        setLogoUrl("");
        return;
      }

      try {
        const base64 = await api.fs.readFile(logoPath, "base64");
        if (cancelled) return;

        setLogoUrl(`data:image/png;base64,${base64}`);
      } catch {}
    })();

    return () => {
      cancelled = true;
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      logoUrlRef.current = null;
    };
  }, [server, version]);

  useEffect(() => {
    if (!runtime || !serverPath) return;

    let cancelled = false;

    void runtime.runStatus(serverPath).then((status) => {
      if (cancelled || !status) return;
      setRunState(status.state);
      setRunLog(status.log ?? []);
    });

    const offState = runtime.onRunState((payload) => {
      if (!isSameServerPath(payload.serverPath, serverPath)) return;
      setRunState(payload.state);
    });

    const offOutput = runtime.onRunOutput((payload) => {
      if (!isSameServerPath(payload.serverPath, serverPath)) return;
      setRunLog((previous) =>
        [...previous, ...payload.lines].slice(-MAX_SERVER_LOG_LINES),
      );
    });

    return () => {
      cancelled = true;
      offState();
      offOutput();
    };
  }, [runtime, serverPath]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [runLog]);

  const isServerBusy = runState !== "stopped";

  const toggleServer = useCallback(async () => {
    if (!runtime || !serverPath) return;

    setIsLoading(true);
    setLoadingType(LoadingType.RUN);

    try {
      const result =
        runState === "stopped"
          ? await runtime.start(serverPath)
          : await runtime.stop(serverPath);

      if (!result?.ok) {
        showFailureToast(
          t("serverManager.runError"),
          result?.error,
          {
            channels: ["server:start", "server:stop"],
            fallbackDescription:
              RUN_ERROR_KEYS[result?.error ?? ""] !== undefined
                ? t(RUN_ERROR_KEYS[result?.error ?? ""])
                : result?.error,
          },
        );
      }
    } catch (error) {
      showFailureToast(t("serverManager.runError"), error);
    } finally {
      setLoadingType(null);
      setIsLoading(false);
    }
  }, [runtime, runState, serverPath, t]);

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    setLoadingType(LoadingType.DELETE);

    try {
      await api.shell.trashItem(serverPath);

      toast.success(t("serverManager.deleted"));

      onDelete();
      onClose();
    } catch (error) {
      showFailureToast(t("serverManager.deleteError"), error, {
        fallbackDescription: t("serverManager.deleteErrorHint"),
      });
    } finally {
      setLoadingType(null);
      setIsLoading(false);
    }
  }, [serverPath, onClose, onDelete, t]);

  const runStateLabels: Record<ServerRunState, string> = {
    stopped: t("serverManager.stateStopped"),
    starting: t("serverManager.stateStarting"),
    running: t("serverManager.stateRunning"),
    stopping: t("serverManager.stateStopping"),
  };

  const showConsole = !!runtime && (isServerBusy || runLog.length > 0);

  return server ? (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open && !isLoading) onClose();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "overflow-hidden p-0",
            showConsole ? "sm:max-w-md" : "sm:max-w-xs",
          )}
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
              {t("versions.serverManager")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 px-5 pb-5">
            <Card className="gap-0 overflow-hidden py-0 shadow-none">
              <CardContent className="p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={serverLogo ? deleteLogo : openLogoPicker}
                    className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/35 text-muted-foreground transition-colors hover:bg-muted/55 disabled:pointer-events-none disabled:opacity-50"
                    aria-label={
                      serverLogo ? t("common.delete") : t("common.logo")
                    }
                  >
                    {serverLogo ? (
                      <>
                        <img
                          src={serverLogo}
                          alt=""
                          height={56}
                          width={56}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <X className="size-4" />
                        </span>
                      </>
                    ) : (
                      <ImagePlus className="size-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {t("serverSettings.serverCore")}
                    </p>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="min-w-0 px-2.5 py-1 text-sm"
                      >
                        <Cpu className="size-3.5" />
                        <span className="truncate">{server.core}</span>
                      </Badge>
                      {runtime && (
                        <Badge
                          variant={isServerBusy ? "default" : "outline"}
                          className="min-w-0 px-2.5 py-1 text-sm"
                        >
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              runState === "running"
                                ? "bg-emerald-500"
                                : runState === "stopped"
                                  ? "bg-muted-foreground"
                                  : "bg-amber-500",
                            )}
                          />
                          <span className="truncate">
                            {runStateLabels[runState]}
                          </span>
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {showConsole && (
              <ScrollArea className="h-40 rounded-lg border bg-muted/30">
                <div className="p-3 font-mono text-[11px] leading-4 text-muted-foreground">
                  {runLog.map((line, index) => (
                    <p key={index} className="whitespace-pre-wrap break-all">
                      {line}
                    </p>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </ScrollArea>
            )}

            <Separator />

            <div className="grid gap-2">
              {runtime && (
                <Button
                  variant={isServerBusy ? "secondary" : "default"}
                  disabled={isLoading || runState === "stopping"}
                  onClick={async () => {
                    await toggleServer();
                  }}
                >
                  {isServerBusy ? (
                    <Square className="size-5" />
                  ) : (
                    <Play className="size-5" />
                  )}
                  {isServerBusy
                    ? t("serverManager.stop")
                    : t("serverManager.start")}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={isLoading}
                onClick={async () => {
                  const serverPropertiesPath = await api.path.join(
                    serverPath,
                    "server.properties",
                  );
                  const isExists =
                    await api.fs.pathExists(serverPropertiesPath);
                  if (!isExists) {
                    toast.error(t("serverManager.serverPropertiesNotFound"));
                    return;
                  }

                  setIsSettings(true);
                }}
              >
                <Settings className="size-5" />
                {t("settings.title")}
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await api.shell.openPath(serverPath);
                }}
              >
                <Folder className="size-5" />
                {t("common.openFolder")}
              </Button>
              <Button
                variant="destructive"
                disabled={isLoading || isServerBusy}
                onClick={() => {
                  setIsConfirmationOpen(true);
                }}
              >
                <Trash className="size-5" />
                {t("common.delete")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isSettings && version && (
        <ServerSettings
          resourcePacks={version.version.loader.mods.filter(
            (project) => project.projectType == ProjectType.RESOURCEPACK,
          )}
          serverData={server}
          serverPath={serverPath}
          onClose={() => setIsSettings(false)}
          open={isSettings}
        />
      )}
      {isCropping && (
        <ImageCropper
          title={t("common.editingLogo")}
          image={image}
          onClose={() => setIsCropping(false)}
          size={{
            height: 64,
            width: 64,
          }}
          changeImageBlob={changeImage}
        />
      )}

      {isConfirmationOpen && (
        <Confirmation
          content={[
            {
              text: t("serverManager.confirmation"),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              loading: isLoading && loadingType == LoadingType.DELETE,
              onClick: async () => {
                await handleDelete();
                setIsConfirmationOpen(false);
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setIsConfirmationOpen(false),
            },
          ]}
          onClose={() => setIsConfirmationOpen(false)}
        />
      )}
    </>
  ) : (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>{t("serverManager.configNotFound")}</AlertTitle>
    </Alert>
  );
}
