import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowUpFromLine, FolderOpen, Loader2, Trash } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@renderer/utilities/file";
import { Confirmation } from "../../Confirmation";
import { toast } from "sonner";

const api = window.api;

const MAX_OTHER_BYTES = 1_000_000_000;

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

  async function updateShare(silentMode = false, shareCode: string) {
    if (!selectedVersion || !account || !authData) return;

    const versionPath = selectedVersion.versionPath;

    if (!silentMode) {
      setIsLoading(true);
      setLoadingType("share");
    }

    let mods = [...selectedVersion.version.loader.mods];

    try {
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
        const result = await api.version.share.uploadMods(
          account.accessToken!,
          {
            ...selectedVersion.version,
            shareCode,
          },
        );
        if (!result.success) throw new Error("local mods upload failed");
        mods = result.mods;
      }

      let other: ILoader["other"] | null = null;
      const versionIndex = versions.findIndex(
        (v) => v.version.name === selectedVersion.version.name,
      );

      if (isShareOtherFiles) {
        other = { paths: [], url: "", size: 0 };

        if (paths.length > 0) {
          const validPaths = await Promise.all(
            paths.map((p) => api.path.join(versionPath, p)),
          );

          const computedTotalSize = await api.file.getTotalSizes(validPaths);
          if (computedTotalSize > MAX_OTHER_BYTES) {
            throw new Error("limit exceeded");
          }

          const tmpZipPath = await api.path.join(
            await api.other.getPath("temp"),
            `other_${shareCode}_${Date.now()}.zip`,
          );

          await api.file.archiveFiles(validPaths, tmpZipPath, versionPath);

          const url = await api.backend.uploadFileFromPath(
            account.accessToken!,
            tmpZipPath,
            undefined,
            `modpacks/${shareCode}`,
          );

          await api.fs.rimraf(tmpZipPath);

          if (!url) throw new Error("not uploaded");

          other = { paths, url, size: computedTotalSize };

        }

        selectedVersion.version.loader.other = other;
        isUpdateVersionLocal = true;
      }

      let updateImage = selectedVersion.version.image;
      if ((isShareImage || silentMode) && selectedVersion.version.image) {
        const response = await fetch(selectedVersion.version.image);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        const tmpPath = await api.path.join(
          await api.other.getPath("temp"),
          `logo_${shareCode}.png`,
        );

        await api.fs.writeFile(tmpPath, buffer);

        const upload = await api.backend.uploadFileFromPath(
          account.accessToken!,
          tmpPath,
          undefined,
          `modpacks/${shareCode}`,
        );

        await api.fs.rimraf(tmpPath);

        if (upload) {
          selectedVersion.version.image = upload;
          updateImage = upload;
          isUpdateVersionLocal = true;
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
      };

      const isUpdated = await api.backend.updateModpack(
        account.accessToken!,
        shareCode,
        update,
      );
      if (!isUpdated) throw new Error("not updated");

      selectedVersion.version.build = nextBuild;
      isUpdateVersionLocal = true;

      if (versionIndex !== -1) {
        versions[versionIndex].version.build = nextBuild;
        if (isShareOtherFiles) {
          if (other) versions[versionIndex].version.loader.other = other;
          else delete versions[versionIndex].version.loader.other;
        }
        if (isShareImage || silentMode)
          versions[versionIndex].version.image = updateImage;
        setVersions([...versions]);
      }

      if (isUpdateVersionLocal) {
        await selectedVersion.save();
        setSelectedVersion(selectedVersion);
      }

      if (!silentMode) {
        toast.success(t("versions.published"));
      }
    } catch {
      if (!silentMode) {
        toast.error(t("versions.publishError"));
      }
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
      closeModal();
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
        <DialogContent
          className="overflow-hidden p-0 sm:max-w-md"
          onPointerDownOutside={(event) => {
            if (isLoading) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isLoading) event.preventDefault();
          }}
        >
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{t("versions.shareOptions")}</DialogTitle>
          </DialogHeader>
          <TooltipProvider>
            <div className="px-6 pb-2">
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
                            !diffenceUpdateData.includes("other")) ||
                          isLoading
                        }
                        checked={isShareOtherFiles}
                        onCheckedChange={(checked) => {
                          const value = checked === true;
                          setIsShareOtherFiles(value);
                          if (value)
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
                            disabled={isLoading || !isShareOtherFiles}
                            onClick={async () => {
                              if (!selectedVersion) return;
                              setSelectPathsFolder(selectedVersion.versionPath);
                              setIsOpenSelectPaths(true);
                            }}
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
                </div>
              </div>
            </div>
          </TooltipProvider>

          <DialogFooter className="border-t bg-muted/20 px-6 pt-4 pb-8">
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                disabled={
                  isLoading ||
                  !isNetwork ||
                  totalSize > MAX_OTHER_BYTES ||
                  (shareType === "update" ? !hasAnyUpdateChanges : false)
                }
                onClick={async () => {
                  if (!selectedVersion || !account || !authData) return;

                  if (
                    shareType === "update" &&
                    selectedVersion.version.shareCode
                  ) {
                    await updateShare(false, selectedVersion.version.shareCode);
                    closeModal();
                    return;
                  }

                  try {
                    setLoadingType("share");
                    setIsLoading(true);

                    const shareCode = await api.backend.shareModpack(
                      account.accessToken!,
                      {
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

                    await updateShare(true, shareCode);

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
                    await api.clipboard.writeText(shareCode);

                    toast.success(t("versions.published"));
                  } catch {
                    toast.error(t("versions.publishError"));
                  } finally {
                    setIsLoading(false);
                    setLoadingType(undefined);
                    closeModal();
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
          passPaths={(p: string[]) => setPaths(p)}
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
