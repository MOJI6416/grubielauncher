import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ILoader } from "@/types/Loader";
import { SelectPaths } from "@renderer/components/Modals/Version/Share/SelectPaths";
import { IModpack, IModpackUpdate } from "@/types/Backend";
import type { UploadFileProgress } from "@/types/Backend";
import {
  accountAtom,
  authDataAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  versionsAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { ArrowUpFromLine, FolderOpen, Loader2, Share2, Trash } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@renderer/utilities/file";
import { buildPackShareUrl } from "@renderer/utilities/packShare";
import { getLocalPathFromFileUrl } from "@renderer/utilities/exportVersion";
import { Confirmation } from "../../Confirmation";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { FormErrorMessage } from "@/components/ui/form-error-message";

const api = window.api;

const MAX_OTHER_BYTES = 1_000_000_000;

type SharePublishStage =
  | "creatingShare"
  | "uploadingMods"
  | "preparingArchive"
  | "archivingOther"
  | "uploadingOther"
  | "uploadingLogo"
  | "publishing"
  | "saving"
  | "completed"
  | "error";

interface SharePublishProgress {
  stage: SharePublishStage;
  percent: number;
  loaded?: number;
  total?: number;
  errorCode?: string;
  statusCode?: number;
}

export function Share({
  closeModal,
  modpack,
  shareType,
  diffenceUpdateData,
  onPublished,
}: {
  closeModal: () => void;
  modpack?: IModpack;
  shareType: "new" | "update";
  diffenceUpdateData: string;
  onPublished?: (shareCode: string) => void;
}) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"share" | "delete" | "size">();
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom);

  const [isShareName, setIsShareName] = useState(false);
  const [isShareImage, setIsShareImage] = useState(false);
  const [isShareMods, setIsShareMods] = useState(false);
  const [isShareServers, setIsShareServers] = useState(false);
  const [isShareOptions, setIsShareOptions] = useState(false);
  const [isShareArguments, setIsShareArguments] = useState(false);
  const [isShareOtherFiles, setIsShareOtherFiles] = useState(false);
  const [isCatalogPublic, setIsCatalogPublic] = useState(
    () => modpack?.isPublic !== false,
  );
  const [isPublishBanned, setIsPublishBanned] = useState(false);

  const [paths, setPaths] = useState<string[]>([]);
  const [isOpenSelectPaths, setIsOpenSelectPaths] = useState(false);

  const [selectPathsFolder, setSelectPathsFolder] = useState<string>("");

  const [totalSize, setTotalSize] = useState(0);
  const [isExistsOptionsFile, setIsExistsOptionsFile] = useState(false);

  const [isNetwork] = useAtom(networkAtom);
  const [servers] = useAtom(versionServersAtom);
  const [account] = useAtom(accountAtom);
  const [globalPaths] = useAtom(pathsAtom);
  const [versions, setVersions] = useAtom(versionsAtom);
  const [authData] = useAtom(authDataAtom);

  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const uploadProgressIdRef = useRef<string | null>(null);
  const uploadProgressRef = useRef<UploadFileProgress | null>(null);
  const publishErrorRef = useRef<string | null>(null);
  const [publishProgress, setPublishProgress] =
    useState<SharePublishProgress | null>(null);

  useEffect(() => {
    return api.backend.onUploadFileProgress((progress) => {
      if (progress.id !== uploadProgressIdRef.current) return;
      uploadProgressRef.current = progress;
      setPublishProgress((current) => {
        if (!current || current.stage !== "uploadingOther") return current;
        return {
          ...current,
          percent: 45 + Math.round(progress.percent * 0.35),
          loaded: progress.loaded,
          total: progress.total,
          statusCode: progress.statusCode,
          errorCode:
            progress.status === "error" && progress.statusCode === 413
              ? "payloadTooLarge"
              : current.errorCode,
        };
      });
    });
  }, []);

  useEffect(() => {
    const token = account?.accessToken;
    const sub = authData?.sub;
    if (!token || !sub) return;

    let cancelled = false;
    api.backend.getUser(token, sub).then((user) => {
      if (cancelled || !user?.publishBanned) return;
      setIsPublishBanned(true);
      setIsCatalogPublic(false);
    });

    return () => {
      cancelled = true;
    };
  }, [account?.accessToken, authData?.sub]);

  useEffect(() => {
    let cancelled = false;

    const checkOptionsFile = async () => {
      if (!selectedVersion) {
        setIsExistsOptionsFile(false);
        return;
      }

      try {
        const optionsPath = await api.path.join(
          selectedVersion.versionPath,
          "options.txt",
        );
        const exists = await api.fs.pathExists(optionsPath);
        if (!cancelled) setIsExistsOptionsFile(!!exists);
      } catch {
        if (!cancelled) setIsExistsOptionsFile(false);
      }
    };

    checkOptionsFile();
    return () => {
      cancelled = true;
    };
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    const fetchTotalSizes = async () => {
      if (!selectedVersion || !isShareOtherFiles || paths.length === 0) {
        setTotalSize(0);
        return;
      }

      setIsLoading(true);
      setLoadingType("size");

      try {
        const versionPath = selectedVersion.versionPath;
        const fullPaths = await Promise.all(
          paths.map((p) => api.path.join(versionPath, p)),
        );
        const sizes = await api.file.getTotalSizes(fullPaths);
        if (!cancelled) setTotalSize(sizes);
      } catch {
        if (!cancelled) setTotalSize(0);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setLoadingType(undefined);
        }
      }
    };

    fetchTotalSizes();
    return () => {
      cancelled = true;
    };
  }, [paths, isShareOtherFiles, selectedVersion]);

  const hasAnyUpdateChanges = useMemo(() => {
    if (shareType !== "update" || !modpack || !selectedVersion) return true;

    const previousOtherPaths = modpack.conf.loader.other?.paths || [];
    const nextOtherPaths = paths;
    const otherPathsSame =
      previousOtherPaths.length === nextOtherPaths.length &&
      previousOtherPaths.every((p) => nextOtherPaths.includes(p));
    const otherSizeSame = totalSize === (modpack.conf.loader.other?.size || 0);
    const otherSame = otherSizeSame && otherPathsSame;

    const anyShareFlags =
      isShareName ||
      isShareMods ||
      isShareOptions ||
      isShareServers ||
      isShareImage ||
      isShareArguments ||
      (isShareOtherFiles && !otherSame);

    return anyShareFlags;
  }, [
    shareType,
    modpack,
    selectedVersion,
    isShareName,
    isShareMods,
    isShareOptions,
    isShareServers,
    isShareImage,
    isShareArguments,
    isShareOtherFiles,
    paths,
    totalSize,
  ]);

  function openOtherFilesSelector() {
    if (!selectedVersion) return;

    if (paths.length === 0) {
      setPaths(selectedVersion.version.loader.other?.paths || []);
    }
    setSelectPathsFolder(selectedVersion.versionPath);
    setIsOpenSelectPaths(true);
  }

  function handleSelectedOtherPaths(nextPaths: string[]) {
    const hadPublishedOther =
      shareType === "update" &&
      !!modpack?.conf.loader.other &&
      ((modpack.conf.loader.other.paths?.length || 0) > 0 ||
        (modpack.conf.loader.other.size || 0) > 0);

    setPaths(nextPaths);
    setIsShareOtherFiles(nextPaths.length > 0 || hadPublishedOther);
    uploadProgressRef.current = null;
    setPublishProgress(null);
  }

  function updatePublishProgress(progress: SharePublishProgress | null) {
    setPublishProgress(progress);
  }

  function getPublishErrorCode(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "payload_too_large") return "payloadTooLarge";
    if (message === "limit_exceeded") return "limitExceeded";
    if (message === "upload_failed") return "uploadFailed";
    return "generic";
  }

  function getPublishErrorToast(errorCode: string | null) {
    if (errorCode === "payloadTooLarge") return t("share.uploadPayloadTooLarge");
    if (errorCode === "limitExceeded") return t("share.limitExceeded");
    if (errorCode === "uploadFailed") return t("share.uploadFailedDescription");
    return t("versions.publishError");
  }

  async function updateShare(silentMode = false, shareCode: string) {
    if (!selectedVersion || !account || !authData) return false;

    const versionPath = selectedVersion.versionPath;

    if (!silentMode) {
      setIsLoading(true);
      setLoadingType("share");
    }

    let mods = [...selectedVersion.version.loader.mods];
    let shouldUpdateLocalMods = false;
    let shouldUpdateLocalOther = false;
    let shouldUpdateLocalImage = false;
    let uploadedOtherUrl: string | null = null;
    let uploadedImageUrl: string | null = null;

    try {
      publishErrorRef.current = null;
      let options = "";
      if (isShareOptions) {
        const optionsPath = await api.path.join(versionPath, "options.txt");
        try {
          options = await api.fs.readFile(optionsPath, "utf-8");
        } catch {}
      }

      let isUpdateVersionLocal = false;
      const nextBuild = silentMode
        ? selectedVersion.version.build || 0
        : (selectedVersion.version.build || 0) + 1;

      if (isShareMods) {
        updatePublishProgress({
          stage: "uploadingMods",
          percent: 15,
        });
        const result = await api.version.share.uploadMods(
          account.accessToken!,
          {
            ...selectedVersion.version,
            shareCode,
          },
        );
        if (!result.success) throw new Error("local mods upload failed");
        mods = result.mods;
        shouldUpdateLocalMods = true;
      }

      let other: ILoader["other"] | null = null;
      const versionIndex = versions.findIndex(
        (v) => v.version.name === selectedVersion.version.name,
      );

      if (isShareOtherFiles) {
        other = { paths: [], url: "", size: 0 };

        const serverOverridesPath = await api.path.join(
          versionPath,
          "storage",
          "server-overrides",
        );
        const hasServerOverrides =
          await api.fs.pathExists(serverOverridesPath);

        if (paths.length > 0 || hasServerOverrides) {
          updatePublishProgress({
            stage: "preparingArchive",
            percent: 25,
          });
          const validPaths = await Promise.all(
            paths.map((p) => api.path.join(versionPath, p)),
          );
          if (hasServerOverrides) validPaths.push(serverOverridesPath);

          const computedTotalSize = await api.file.getTotalSizes(validPaths);
          if (computedTotalSize > MAX_OTHER_BYTES) {
            throw new Error("limit_exceeded");
          }

          const tmpZipPath = await api.path.join(
            await api.other.getPath("temp"),
            `other_${shareCode}_${Date.now()}.zip`,
          );

          updatePublishProgress({
            stage: "archivingOther",
            percent: 35,
            total: computedTotalSize,
          });
          await api.file.archiveFiles(validPaths, tmpZipPath, versionPath);

          const progressId = `other-${shareCode}-${Date.now()}`;
          uploadProgressIdRef.current = progressId;
          const initialUploadProgress: UploadFileProgress = {
            id: progressId,
            status: "preparing",
            loaded: 0,
            total: computedTotalSize,
            percent: 0,
          };
          uploadProgressRef.current = initialUploadProgress;
          updatePublishProgress({
            stage: "uploadingOther",
            percent: 45,
            loaded: 0,
            total: computedTotalSize,
          });

          const url = await api.backend.uploadFileFromPath(
            account.accessToken!,
            tmpZipPath,
            undefined,
            `modpacks/${shareCode}`,
            progressId,
            true,
          );

          await api.fs.rimraf(tmpZipPath);

          if (!url) {
            if (uploadProgressRef.current?.statusCode === 413) {
              throw new Error("payload_too_large");
            }
            throw new Error("upload_failed");
          }

          uploadedOtherUrl = url;
          other = { paths, url, size: computedTotalSize };

        }

        shouldUpdateLocalOther = true;
      }

      let updateImage = selectedVersion.version.image;
      if ((isShareImage || silentMode) && selectedVersion.version.image) {
        updatePublishProgress({
          stage: "uploadingLogo",
          percent: 82,
        });
        const tmpPath = await api.path.join(
          await api.other.getPath("temp"),
          `logo_${shareCode}.png`,
        );

        if (selectedVersion.version.image.startsWith("file://")) {
          await api.fs.copy(
            getLocalPathFromFileUrl(selectedVersion.version.image),
            tmpPath,
          );
        } else {
          const response = await fetch(selectedVersion.version.image);
          const buffer = new Uint8Array(
            await (await response.blob()).arrayBuffer(),
          );
          await api.fs.writeFile(tmpPath, buffer);
        }

        const upload = await api.backend.uploadFileFromPath(
          account.accessToken!,
          tmpPath,
          undefined,
          `modpacks/${shareCode}`,
        );

        await api.fs.rimraf(tmpPath);

        if (upload) {
          updateImage = upload;
          uploadedImageUrl = upload;
          shouldUpdateLocalImage = true;
        }
      }

      const update: IModpackUpdate = {
        build: nextBuild,
        name: isShareName ? selectedVersion.version.name : null,
        mods: isShareMods ? mods : null,
        servers: isShareServers ? servers : null,
        options: isShareOptions ? options : null,
        runArguments:
          isShareArguments && selectedVersion.version.runArguments
            ? selectedVersion.version.runArguments
            : null,
        other: isShareOtherFiles ? other : null,
        image: isShareImage || silentMode ? updateImage : null,
        quickServer: isShareServers
          ? selectedVersion.version.quickServer || ""
          : null,
        isPublic: isCatalogPublic,
      };

      updatePublishProgress({
        stage: "publishing",
        percent: 92,
      });
      const isUpdated = await api.backend.updateModpack(
        account.accessToken!,
        shareCode,
        update,
      );
      if (!isUpdated) throw new Error("not updated");

      if (shouldUpdateLocalMods) selectedVersion.version.loader.mods = mods;
      if (shouldUpdateLocalOther) {
        if (other) selectedVersion.version.loader.other = other;
        else delete selectedVersion.version.loader.other;
      }
      if (shouldUpdateLocalImage) selectedVersion.version.image = updateImage;

      selectedVersion.version.build = nextBuild;
      isUpdateVersionLocal = true;

      if (versionIndex !== -1) {
        versions[versionIndex].version.build = nextBuild;
        if (shouldUpdateLocalMods) {
          versions[versionIndex].version.loader.mods = mods;
        }
        if (shouldUpdateLocalOther) {
          if (other) versions[versionIndex].version.loader.other = other;
          else delete versions[versionIndex].version.loader.other;
        }
        if (shouldUpdateLocalImage)
          versions[versionIndex].version.image = updateImage;
        setVersions([...versions]);
      }

      if (isUpdateVersionLocal) {
        updatePublishProgress({
          stage: "saving",
          percent: 97,
        });
        await selectedVersion.save();
        setSelectedVersion(selectedVersion);
      }

      updatePublishProgress({
        stage: "completed",
        percent: 100,
      });
      if (!silentMode) {
        toast.success(t("versions.published"));
        onPublished?.(shareCode);
      }
      return true;
    } catch (error) {
      const errorCode = getPublishErrorCode(error);
      publishErrorRef.current = errorCode;
      updatePublishProgress({
        stage: "error",
        percent: 100,
        errorCode,
        statusCode: uploadProgressRef.current?.statusCode,
      });
      if (uploadedOtherUrl) {
        await api.backend
          .deleteFile(account.accessToken!, uploadedOtherUrl)
          .catch(() => undefined);
      }
      if (uploadedImageUrl) {
        await api.backend
          .deleteFile(account.accessToken!, uploadedImageUrl)
          .catch(() => undefined);
      }
      if (!silentMode) {
        toast.error(getPublishErrorToast(errorCode));
      }
      return false;
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  const handleDelete = useCallback(async () => {
    if (
      !selectedVersion ||
      !account ||
      !selectedVersion.version.shareCode ||
      !authData
    )
      return;

    setIsLoading(true);
    setLoadingType("delete");

    const result = await api.backend.deleteModpack(
      account.accessToken!,
      selectedVersion.version.shareCode,
    );

    if (!result) {
      toast.error(t("ownModpacks.deleteError"));

      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    const shareCode = selectedVersion.version.shareCode;
    selectedVersion.version.shareCode = "";
    selectedVersion.version.image = "";
    await selectedVersion.save();

    const index = versions.findIndex(
      (v) => v.version.name === selectedVersion.version.name,
    );
    if (index !== -1 && versions[index].version.shareCode === shareCode) {
      versions[index].version.shareCode = "";
      setVersions([...versions]);
    }

    setIsLoading(false);
    setLoadingType(undefined);

    closeModal();
    toast.success(t("ownModpacks.deleted"));
  }, [selectedVersion, account, authData, versions, closeModal, t]);

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open && !isLoading) closeModal();
        }}
      >
        <DialogContent aria-describedby={undefined}
          className="overflow-hidden p-0 sm:max-w-md"
          onPointerDownOutside={(event) => {
            if (isLoading) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isLoading) event.preventDefault();
          }}
        >
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="size-5" />
              {t("versions.shareOptions")}
            </DialogTitle>
          </DialogHeader>
          <TooltipProvider>
            <div className="px-6 pb-2">
              <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t("share.catalogPublic")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isPublishBanned
                      ? t("share.catalogPublicBanned")
                      : t("share.catalogPublicDescription")}
                  </p>
                </div>
                <Switch
                  checked={isCatalogPublic && !isPublishBanned}
                  disabled={isLoading || isPublishBanned}
                  onCheckedChange={setIsCatalogPublic}
                />
              </div>

              <div className="grid gap-0.5 rounded-lg border bg-card p-1.5">
                {shareType === "update" && (
                  <>
                  <label className="flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
                      <Checkbox
                        disabled={
                          !diffenceUpdateData.includes("name") || isLoading
                        }
                        checked={isShareName}
                        onCheckedChange={(checked) =>
                          setIsShareName(checked === true)
                        }
                      />
                      {t("versions.updateName")}
                    </label>
                  <label className="flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
                      <Checkbox
                        disabled={
                          !diffenceUpdateData.includes("logo") || isLoading
                        }
                        checked={isShareImage}
                        onCheckedChange={(checked) =>
                          setIsShareImage(checked === true)
                        }
                      />
                      {t("versions.updateLogo")}
                    </label>
                  </>
                )}

              <label className="flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
                  <Checkbox
                    disabled={
                      (shareType === "new"
                        ? (selectedVersion?.version.loader.mods.length ?? 0) ===
                          0
                        : !diffenceUpdateData.includes("mods")) || isLoading
                    }
                    checked={isShareMods}
                    onCheckedChange={(checked) =>
                      setIsShareMods(checked === true)
                    }
                  />
                  {shareType === "new"
                    ? t("versions.shareMods")
                    : t("versions.updateMods")}
                </label>

                <label className="flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
                  <Checkbox
                    disabled={
                      (shareType === "new"
                        ? servers.length === 0
                        : !diffenceUpdateData.includes("servers")) || isLoading
                    }
                    checked={isShareServers}
                    onCheckedChange={(checked) =>
                      setIsShareServers(checked === true)
                    }
                  />
                  {shareType === "new"
                    ? t("versions.shareServers")
                    : t("versions.updateServers")}
                </label>

                <label className="flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
                  <Checkbox
                    disabled={
                      (shareType === "new"
                        ? !isExistsOptionsFile
                        : !diffenceUpdateData.includes("options")) || isLoading
                    }
                    checked={isShareOptions}
                    onCheckedChange={(checked) =>
                      setIsShareOptions(checked === true)
                    }
                  />
                  {shareType === "new"
                    ? t("versions.shareGameSettings")
                    : t("versions.updateGameSettings")}
                </label>

                <label className="flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
                  <Checkbox
                    disabled={
                      (shareType === "new"
                        ? !selectedVersion?.version.runArguments?.jvm &&
                          !selectedVersion?.version.runArguments?.game
                        : !diffenceUpdateData.includes("arguments")) ||
                      isLoading
                    }
                    checked={isShareArguments}
                    onCheckedChange={(checked) =>
                      setIsShareArguments(checked === true)
                    }
                  />
                  {shareType === "new"
                    ? t("versions.shareArguments")
                    : t("versions.updateArguments")}
                </label>

                <div className="grid gap-1 rounded-md px-2 py-1 transition-colors hover:bg-accent/50">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <label className="flex min-w-0 items-center gap-2.5 text-sm">
                      <Checkbox
                        disabled={
                          (shareType === "update" &&
                            !diffenceUpdateData.includes("other") &&
                            !isShareOtherFiles) ||
                          isLoading
                        }
                        checked={isShareOtherFiles}
                        onCheckedChange={(checked) => {
                          const value = checked === true;
                          setIsShareOtherFiles(value);
                          if (value && paths.length === 0)
                            setPaths(
                              selectedVersion?.version.loader.other?.paths ||
                                [],
                            );
                        }}
                      />
                      {shareType === "new"
                        ? t("versions.shareOtherFiles")
                        : t("versions.updateOtherFiles")}
                    </label>

                    <Tooltip
                      open={totalSize > MAX_OTHER_BYTES ? undefined : false}
                    >
                      <TooltipTrigger asChild>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant={
                              totalSize > MAX_OTHER_BYTES
                                ? "secondary"
                                : "outline"
                            }
                            size="icon-sm"
                            disabled={isLoading}
                            onClick={openOtherFilesSelector}
                          >
                            {isLoading && loadingType === "size" ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <FolderOpen className="size-4" />
                            )}
                          </Button>

                          {totalSize > 0 && isShareOtherFiles && (
                            <p
                              className={`max-w-24 truncate text-xs ${
                                totalSize > MAX_OTHER_BYTES
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {formatBytes(totalSize, [
                                t("sizes.0"),
                                t("sizes.1"),
                                t("sizes.2"),
                                t("sizes.3"),
                                t("sizes.4"),
                              ])}
                            </p>
                          )}
                        </div>
                      </TooltipTrigger>
                      {totalSize > MAX_OTHER_BYTES && (
                        <TooltipContent>
                          {t("share.limitExceeded")}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </div>

                  {(selectedVersion?.version.downloadedVersion ||
                    (selectedVersion?.version.loader.mods.length ?? 0) > 0) && (
                    <p className="text-xs text-muted-foreground">
                      {t("share.downloadedOtherFilesHint")}
                    </p>
                  )}
                </div>
              </div>

              {publishProgress && (
                <div className="mt-3 grid gap-1.5 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">
                      {t(`share.publishProgress.${publishProgress.stage}`)}
                    </span>
                    {publishProgress.stage === "uploadingOther" &&
                    typeof publishProgress.loaded === "number" &&
                    typeof publishProgress.total === "number" ? (
                      <span className="shrink-0 text-muted-foreground">
                        {formatBytes(publishProgress.loaded, [
                          t("sizes.0"),
                          t("sizes.1"),
                          t("sizes.2"),
                          t("sizes.3"),
                          t("sizes.4"),
                        ])}
                        {" / "}
                        {formatBytes(publishProgress.total, [
                          t("sizes.0"),
                          t("sizes.1"),
                          t("sizes.2"),
                          t("sizes.3"),
                          t("sizes.4"),
                        ])}
                      </span>
                    ) : (
                      <span className="shrink-0 text-muted-foreground">
                        {Math.min(100, Math.max(0, publishProgress.percent))}%
                      </span>
                    )}
                  </div>
                  <div className="grid min-w-0">
                    <Progress
                      value={Math.min(
                        100,
                        Math.max(0, publishProgress.percent),
                      )}
                    />
                    <FormErrorMessage show={publishProgress.stage === "error"}>
                      {t(
                        `share.publishErrors.${
                          publishProgress.errorCode || "generic"
                        }`,
                      )}
                    </FormErrorMessage>
                  </div>
                </div>
              )}
            </div>
          </TooltipProvider>

          <DialogFooter className="border-t bg-muted/20 px-6 pt-4 pb-8">
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                disabled={
                  isLoading ||
                  !isNetwork ||
                  totalSize > MAX_OTHER_BYTES ||
                  (shareType === "update"
                    ? !hasAnyUpdateChanges &&
                      isCatalogPublic === (modpack?.isPublic !== false)
                    : false)
                }
                onClick={async () => {
                  if (!selectedVersion || !account || !authData) return;

                  if (
                    shareType === "update" &&
                    selectedVersion.version.shareCode
                  ) {
                    const isUpdated = await updateShare(
                      false,
                      selectedVersion.version.shareCode,
                    );
                    if (isUpdated) closeModal();
                    return;
                  }

                  let createdShareCode: string | null = null;
                  let isPublished = false;
                  try {
                    setLoadingType("share");
                    setIsLoading(true);
                    publishErrorRef.current = null;
                    updatePublishProgress({
                      stage: "creatingShare",
                      percent: 5,
                    });

                    const shareCode = await api.backend.shareModpack(
                      account.accessToken!,
                      {
                        isPublic: isCatalogPublic,
                        conf: {
                          ...selectedVersion.version,
                          loader: {
                            ...selectedVersion.version.loader,
                            mods: [],
                          },
                          servers: [],
                          options: "",
                          runArguments: {
                            game: "",
                            jvm: "",
                          },
                          image: selectedVersion.version.image || "",
                          quickServer: "",
                        },
                      },
                    );

                    if (!shareCode) throw new Error("not share code");
                    createdShareCode = shareCode;

                    const isUpdated = await updateShare(true, shareCode);
                    if (!isUpdated) throw new Error("not updated");
                    createdShareCode = null;

                    const index = versions.findIndex(
                      (v) => v.version.name === selectedVersion.version.name,
                    );
                    selectedVersion.version.shareCode = shareCode;
                    if (index !== -1) {
                      versions[index].version.shareCode = shareCode;
                      setVersions([...versions]);
                    }

                    await selectedVersion.save();
                    setSelectedVersion(selectedVersion);
                    onPublished?.(shareCode);
                    await api.clipboard.writeText(buildPackShareUrl(shareCode));

                    toast.success(t("versions.published"));
                    isPublished = true;
                  } catch {
                    if (createdShareCode) {
                      await api.backend
                        .deleteModpack(account.accessToken!, createdShareCode)
                        .catch(() => undefined);
                    }
                    const errorCode = publishErrorRef.current || "generic";
                    toast.error(getPublishErrorToast(errorCode));
                  } finally {
                    setIsLoading(false);
                    setLoadingType(undefined);
                    if (isPublished) closeModal();
                  }
                }}
              >
                {isLoading && loadingType === "share" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUpFromLine className="size-4" />
                )}
                {shareType === "new" ? t("versions.share") : t("common.update")}
              </Button>

              {shareType === "update" && (
                <Button
                  variant="destructive"
                  disabled={isLoading}
                  onClick={() => {
                    setIsConfirmationOpen(true);
                  }}
                >
                  <Trash className="size-4" />
                  {t("common.delete")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isOpenSelectPaths && selectedVersion && (
        <SelectPaths
          loader={selectedVersion.version.loader.name}
          version={selectedVersion.version.version.id}
          onClose={() => setIsOpenSelectPaths(false)}
          passPaths={handleSelectedOtherPaths}
          pathFolder={
            selectPathsFolder ||
            (globalPaths?.minecraft
              ? globalPaths.minecraft
              : selectedVersion.versionPath)
          }
          selectedPaths={paths}
        />
      )}

      {isConfirmationOpen && (
        <Confirmation
          content={[
            {
              text: t("ownModpacks.confirmation", {
                name: selectedVersion?.version.name,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              loading: isLoading && loadingType === "delete",
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
  );
}
