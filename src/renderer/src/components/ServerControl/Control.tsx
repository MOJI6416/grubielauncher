import { useCallback, useEffect, useRef, useState } from "react";
import { ImageCropper } from "../ImageCropper";
import { ServerSettings } from "./Settings";
import { ProjectType } from "@/types/ModManager";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  Folder,
  ImagePlus,
  Settings,
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
import { Separator } from "@/components/ui/separator";
import { Confirmation } from "../Modals/Confirmation";
import { toast } from "sonner";

enum LoadingType {
  RUN = "run",
  DELETE = "delete",
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

  const logoUrlRef = useRef<string | null>(null);

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

  async function changeImage(url: string) {
    if (!server || !serverPath) return;

    const response = await fetch(url);
    const blob = await response.blob();
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

  const handleDelete = useCallback(async () => {
    setIsLoading(true);
    setLoadingType(LoadingType.DELETE);

    try {
      await api.fs.rimraf(serverPath);

      toast.success(t("serverManager.deleted"));

      onDelete();
      onClose();
    } catch (error) {
      toast.error(t("serverManager.deleteError"));
    } finally {
      setLoadingType(null);
      setIsLoading(false);
    }
  }, [serverPath, onClose, onDelete, t]);

  return server ? (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open && !isLoading) onClose();
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
            <DialogTitle>{t("versions.serverManager")}</DialogTitle>
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
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant="secondary" className="min-w-0 px-2.5 py-1 text-sm">
                        <Cpu className="size-3.5" />
                        <span className="truncate">{server.core}</span>
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Separator />

            <div className="grid gap-2">
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
                disabled={isLoading}
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
          changeImage={changeImage}
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
