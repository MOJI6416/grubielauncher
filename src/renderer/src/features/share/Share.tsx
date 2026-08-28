import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapse } from "@/components/ui/collapse";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MODPACK_DESCRIPTION_MAX_CHARS } from "@/shared/config";
import {
  WORLDS_ROOT,
  hasPublishedWorld,
  splitWorldPaths,
} from "@/shared/worldPrivacy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { ILoader } from "@/types/Loader";
import { SelectPathsPanel } from "./SelectPaths";
import { applyUnpublish } from "./unpublish";
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
import {
  ArrowUpFromLine,
  ChevronLeft,
  Copy,
  FolderOpen,
  Link2,
  Loader2,
  Share2,
  Trash,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@renderer/utilities/file";
import { buildPackShareUrl } from "@renderer/utilities/packShare";
import { getLocalPathFromFileUrl } from "@renderer/utilities/exportVersion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  emptyPublishSelection,
  getPublishFields,
  isOtherOverLimit,
  orphanedPublishUploads,
  pickNewPublishDefaults,
  MAX_OTHER_ARCHIVE_BYTES,
  MAX_OTHER_BYTES,
  publishReadiness,
  publishStagePercent,
  resolvePublishErrorCode,
  summarizePublish,
  uploadStagePercent,
  type PublishErrorCode,
  type PublishFieldId,
  type PublishSelection,
  type PublishStage,
  type PublishSummaryItem,
} from "@renderer/features/share/publishPlan";

import { countContent } from "@renderer/features/instances/contentCounts";
import { showFailureToast } from "@renderer/utilities/failures";
import { copyToClipboard } from "@renderer/utilities/clipboard";
import { announceShareCode } from "./publishPresence";
const api = window.api;

interface SharePublishProgress {
  stage: PublishStage;
  percent: number;
  loaded?: number;
  total?: number;
  errorCode?: PublishErrorCode;
  statusCode?: number;
  failedStage?: PublishStage;
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

  const [selection, setSelection] = useState<PublishSelection>(() =>
    emptyPublishSelection(),
  );
  const [isCatalogPublic, setIsCatalogPublic] = useState(
    () => modpack?.isPublic !== false,
  );
  const [isPublishBanned, setIsPublishBanned] = useState(false);
  const [publishBanReason, setPublishBanReason] = useState("");
  const [description, setDescription] = useState(
    () => modpack?.conf.description ?? selectedVersion?.version.description ?? "",
  );

  const [paths, setPaths] = useState<string[]>([]);
  const [view, setView] = useState<"plan" | "files">("plan");
  const [selectPathsFolder, setSelectPathsFolder] = useState<string>("");

  const [totalSize, setTotalSize] = useState(0);
  const [isExistsOptionsFile, setIsExistsOptionsFile] = useState(false);
  const [worldCount, setWorldCount] = useState<number | null>(null);

  const [isNetwork] = useAtom(networkAtom);
  const [servers] = useAtom(versionServersAtom);
  const [account] = useAtom(accountAtom);
  const [globalPaths] = useAtom(pathsAtom);
  const [versions, setVersions] = useAtom(versionsAtom);
  const [authData] = useAtom(authDataAtom);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const defaultedFieldsRef = useRef(new Set<PublishFieldId>());
  const uploadProgressIdRef = useRef<string | null>(null);
  const uploadProgressRef = useRef<UploadFileProgress | null>(null);
  const publishErrorRef = useRef<PublishErrorCode | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const publishStageRef = useRef<PublishStage | null>(null);
  const [publishProgress, setPublishProgress] =
    useState<SharePublishProgress | null>(null);

  useEffect(() => {
    if (!publishProgress) return;

    const scrollToProgress = () => {
      const viewport = progressRef.current?.closest(
        "[data-slot=scroll-area-viewport]",
      );
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    };

    scrollToProgress();
    const timer = window.setTimeout(scrollToProgress, 300);

    return () => window.clearTimeout(timer);
  }, [publishProgress]);

  useEffect(() => {
    return api.backend.onUploadFileProgress((progress) => {
      if (progress.id !== uploadProgressIdRef.current) return;
      uploadProgressRef.current = progress;
      setPublishProgress((current) => {
        if (!current || current.stage !== "uploadingOther") return current;
        return {
          ...current,
          percent: uploadStagePercent(progress.percent),
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
      setPublishBanReason(user.publishBanReason ?? "");
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
    setPaths(
      splitWorldPaths(selectedVersion?.version.loader.other?.paths || [])
        .otherPaths,
    );
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    const countWorlds = async () => {
      if (!selectedVersion) {
        setWorldCount(null);
        return;
      }

      const count = await api.worlds
        .count(selectedVersion.versionPath)
        .catch(() => null);
      if (!cancelled) setWorldCount(count);
    };

    countWorlds();
    return () => {
      cancelled = true;
    };
  }, [selectedVersion]);

  const publishedOtherPaths = useMemo(
    () => modpack?.conf.loader.other?.paths || [],
    [modpack],
  );

  const publishedHasWorld = useMemo(
    () => hasPublishedWorld(modpack?.conf.loader.other),
    [modpack],
  );

  const nextOtherPaths = paths;

  const archiveSourcePaths = useMemo(
    () => (selection.world ? [...paths, WORLDS_ROOT] : paths),
    [paths, selection.world],
  );

  const isArchiveSelected = selection.other || selection.world;

  useEffect(() => {
    let cancelled = false;

    const fetchTotalSizes = async () => {
      if (
        !selectedVersion ||
        !isArchiveSelected ||
        archiveSourcePaths.length === 0
      ) {
        setTotalSize(0);
        return;
      }

      setIsLoading(true);
      setLoadingType("size");

      try {
        const versionPath = selectedVersion.versionPath;
        const fullPaths = await Promise.all(
          archiveSourcePaths.map((p) => api.path.join(versionPath, p)),
        );
        const sizes = await api.file.getTotalSizes(fullPaths);
        if (!cancelled) setTotalSize(sizes ?? 0);
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
  }, [archiveSourcePaths, isArchiveSelected, selectedVersion]);

  const fields = useMemo(
    () =>
      getPublishFields({
        mode: shareType,
        diff: diffenceUpdateData,
        modsCount: countContent(selectedVersion?.version.loader.mods),
        serversCount: servers.length,
        hasOptionsFile: isExistsOptionsFile,
        hasArguments: Boolean(
          selectedVersion?.version.runArguments?.jvm ||
            selectedVersion?.version.runArguments?.game,
        ),
        isOtherSelected: selection.other,
        hasWorlds: (worldCount ?? 0) > 0,
        publishedHasWorld,
      }),
    [
      diffenceUpdateData,
      isExistsOptionsFile,
      publishedHasWorld,
      selectedVersion,
      selection.other,
      servers.length,
      shareType,
      worldCount,
    ],
  );

  useEffect(() => {
    if (shareType !== "new") return;

    const fresh = pickNewPublishDefaults(fields, defaultedFieldsRef.current);
    if (fresh.length === 0) return;

    for (const id of fresh) defaultedFieldsRef.current.add(id);
    setSelection((prev) => {
      const next = { ...prev };
      for (const id of fresh) next[id] = true;
      return next;
    });
  }, [fields, shareType]);

  const isOverLimit = isOtherOverLimit(totalSize);

  const publishedDescription = modpack?.conf.description ?? "";
  const nextDescription = description.trim().slice(0, MODPACK_DESCRIPTION_MAX_CHARS);
  const isDescriptionChanged = nextDescription !== publishedDescription;

  const summary = useMemo(
    () =>
      summarizePublish({
        mode: shareType,
        fields,
        selection,
        publishedOtherPaths,
        publishedOtherSize: modpack?.conf.loader.other?.size || 0,
        nextOtherPaths,
        nextOtherSize: totalSize,
        publishedHasWorld,
        isCatalogPublicChanged:
          isCatalogPublic !== (modpack?.isPublic !== false),
        isDescriptionChanged,
      }),
    [
      fields,
      isCatalogPublic,
      isDescriptionChanged,
      modpack,
      nextOtherPaths,
      publishedHasWorld,
      publishedOtherPaths,
      selection,
      shareType,
      totalSize,
    ],
  );

  const readiness = useMemo(
    () =>
      publishReadiness({
        mode: shareType,
        diff: diffenceUpdateData,
        selection,
        publishedOtherPaths,
        publishedOtherSize: modpack?.conf.loader.other?.size || 0,
        nextOtherPaths,
        nextOtherSize: totalSize,
        publishedHasWorld,
        isCatalogPublicChanged:
          isCatalogPublic !== (modpack?.isPublic !== false),
        isDescriptionChanged,
        selectedCount: summary.length,
      }),
    [
      diffenceUpdateData,
      isCatalogPublic,
      isDescriptionChanged,
      modpack,
      nextOtherPaths,
      publishedHasWorld,
      publishedOtherPaths,
      selection,
      shareType,
      summary.length,
      totalSize,
    ],
  );

  const sizeLabels = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  function fieldLabel(id: PublishFieldId) {
    if (shareType === "update") {
      switch (id) {
        case "name":
          return t("versions.updateName");
        case "logo":
          return t("versions.updateLogo");
        case "mods":
          return t("versions.updateMods");
        case "servers":
          return t("versions.updateServers");
        case "options":
          return t("versions.updateGameSettings");
        case "arguments":
          return t("versions.updateArguments");
        case "world":
          return t("versions.updateWorld");
        default:
          return t("versions.updateOtherFiles");
      }
    }

    switch (id) {
      case "mods":
        return t("versions.shareMods");
      case "servers":
        return t("versions.shareServers");
      case "options":
        return t("versions.shareGameSettings");
      case "arguments":
        return t("versions.shareArguments");
      case "world":
        return t("versions.shareWorld");
      default:
        return t("versions.shareOtherFiles");
    }
  }

  function partLabel(item: PublishSummaryItem): string {
    switch (item) {
      case "name":
        return t("share.publish.parts.name");
      case "logo":
        return t("share.publish.parts.logo");
      case "mods":
        return t("share.publish.parts.mods");
      case "servers":
        return t("share.publish.parts.servers");
      case "options":
        return t("share.publish.parts.options");
      case "arguments":
        return t("share.publish.parts.arguments");
      case "world":
        return t("share.publish.parts.world");
      case "other":
        return t("share.publish.parts.other");
      case "description":
        return t("share.publish.parts.description");
      default:
        return t("share.publish.parts.visibility");
    }
  }

  function fieldMeta(id: PublishFieldId): string {
    switch (id) {
      case "name":
        return selectedVersion?.version.name || "";
      case "mods":
        return String(countContent(selectedVersion?.version.loader.mods));
      case "servers":
        return String(servers.length);
      case "options":
        return "options.txt";
      case "world":
        return worldCount ? String(worldCount) : "";
      case "other":
        return paths.length > 0
          ? totalSize > 0
            ? `${paths.length} · ${formatBytes(totalSize, sizeLabels, 1)}`
            : String(paths.length)
          : "";
      default:
        return "";
    }
  }

  function localOtherPaths() {
    return splitWorldPaths(
      selectedVersion?.version.loader.other?.paths || [],
    ).otherPaths;
  }

  function toggleField(id: PublishFieldId, value: boolean) {
    setSelection((prev) => ({ ...prev, [id]: value }));
    if (id === "other" && value && paths.length === 0) {
      setPaths(localOtherPaths());
    }
  }

  function openOtherFilesSelector() {
    if (!selectedVersion) return;

    if (paths.length === 0) {
      setPaths(localOtherPaths());
    }
    setSelectPathsFolder(selectedVersion.versionPath);
    setView("files");
  }

  function handleSelectedOtherPaths(selectedPaths: string[]) {
    const nextPaths = splitWorldPaths(selectedPaths).otherPaths;
    const hadPublishedOther =
      shareType === "update" &&
      !!modpack?.conf.loader.other &&
      ((modpack.conf.loader.other.paths?.length || 0) > 0 ||
        (modpack.conf.loader.other.size || 0) > 0);

    setPaths(nextPaths);
    setSelection((prev) => ({
      ...prev,
      other: nextPaths.length > 0 || hadPublishedOther,
    }));
    uploadProgressRef.current = null;
    setPublishProgress(null);
    setView("plan");
  }

  function updatePublishProgress(progress: SharePublishProgress | null) {
    if (progress && progress.stage !== "error") {
      publishStageRef.current = progress.stage;
    }
    setPublishProgress(progress);
  }

  function getPublishErrorToast(errorCode: PublishErrorCode | null) {
    if (errorCode === "payloadTooLarge")
      return t("share.uploadPayloadTooLarge");
    if (errorCode === "limitExceeded") return t("share.limitExceeded");
    if (errorCode === "sourceTooLarge") return t("share.sourceTooLarge");
    if (errorCode === "sizeUnknown") return t("share.sizeUnknown");
    if (errorCode === "uploadFailed") return t("share.uploadFailedDescription");
    if (errorCode === "logoFailed") return t("share.logoFailed");
    return t("versions.publishError");
  }

  function publishErrorText(errorCode: PublishErrorCode) {
    switch (errorCode) {
      case "payloadTooLarge":
        return t("share.publishErrors.payloadTooLarge");
      case "limitExceeded":
        return t("share.publishErrors.limitExceeded");
      case "sourceTooLarge":
        return t("share.publishErrors.sourceTooLarge");
      case "sizeUnknown":
        return t("share.publishErrors.sizeUnknown");
      case "uploadFailed":
        return t("share.publishErrors.uploadFailed");
      case "logoFailed":
        return t("share.publishErrors.logoFailed");
      default:
        return t("share.publishErrors.generic");
    }
  }

  function stageText(stage: PublishStage) {
    switch (stage) {
      case "creatingShare":
        return t("share.publishProgress.creatingShare");
      case "uploadingMods":
        return t("share.publishProgress.uploadingMods");
      case "preparingArchive":
        return t("share.publishProgress.preparingArchive");
      case "archivingOther":
        return t("share.publishProgress.archivingOther");
      case "uploadingOther":
        return t("share.publishProgress.uploadingOther");
      case "uploadingLogo":
        return t("share.publishProgress.uploadingLogo");
      case "publishing":
        return t("share.publishProgress.publishing");
      case "saving":
        return t("share.publishProgress.saving");
      case "completed":
        return t("share.publishProgress.completed");
      default:
        return t("share.publishProgress.error");
    }
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
    let isRemoteCommitted = false;

    try {
      publishErrorRef.current = null;
      let options = "";
      if (selection.options) {
        const optionsPath = await api.path.join(versionPath, "options.txt");
        try {
          options = await api.fs.readFile(optionsPath, "utf-8");
        } catch {}
      }

      let isUpdateVersionLocal = false;
      const nextBuild = silentMode
        ? selectedVersion.version.build || 0
        : (selectedVersion.version.build || 0) + 1;

      if (selection.mods) {
        updatePublishProgress({
          stage: "uploadingMods",
          percent: publishStagePercent("uploadingMods"),
        });
        const result = await api.version.share.uploadMods(
          account.accessToken!,
          {
            ...selectedVersion.version,
            shareCode,
          },
        );
        if (!result.success) {
          throw new Error(
            `local mods upload failed${
              result.failures?.length
                ? `: ${result.failures.slice(0, 3).join("; ")}`
                : ""
            }`,
          );
        }
        mods = result.mods;
        shouldUpdateLocalMods = true;
      }

      let other: ILoader["other"] | null = null;
      const versionIndex = versions.findIndex(
        (v) => v.version.name === selectedVersion.version.name,
      );

      if (isArchiveSelected) {
        other = { paths: [], url: "", size: 0 };

        const serverOverridesPath = await api.path.join(
          versionPath,
          "storage",
          "server-overrides",
        );
        const hasServerOverrides = await api.fs.pathExists(serverOverridesPath);

        if (archiveSourcePaths.length > 0 || hasServerOverrides) {
          updatePublishProgress({
            stage: "preparingArchive",
            percent: publishStagePercent("preparingArchive"),
          });
          const validPaths = await Promise.all(
            archiveSourcePaths.map((p) => api.path.join(versionPath, p)),
          );
          if (hasServerOverrides) validPaths.push(serverOverridesPath);

          const computedTotalSize = await api.file.getTotalSizes(validPaths);
          if (computedTotalSize !== null && computedTotalSize > MAX_OTHER_BYTES) {
            throw new Error("source_too_large");
          }

          const tmpZipPath = await api.path.join(
            await api.other.getPath("temp"),
            `other_${shareCode}_${Date.now()}.zip`,
          );

          updatePublishProgress({
            stage: "archivingOther",
            percent: publishStagePercent("archivingOther"),
            total: computedTotalSize ?? undefined,
          });
          if (
            !(await api.file.archiveForPublish(
              validPaths,
              tmpZipPath,
              versionPath,
            ))
          ) {
            throw new Error("upload_failed");
          }

          const archiveSize = await api.file.getTotalSizes([tmpZipPath]);
          if (archiveSize === null && computedTotalSize === null) {
            await api.fs.rimraf(tmpZipPath);
            throw new Error("size_unknown");
          }
          if (archiveSize !== null && archiveSize > MAX_OTHER_ARCHIVE_BYTES) {
            await api.fs.rimraf(tmpZipPath);
            throw new Error("limit_exceeded");
          }

          const progressId = `other-${shareCode}-${Date.now()}`;
          uploadProgressIdRef.current = progressId;
          const initialUploadProgress: UploadFileProgress = {
            id: progressId,
            status: "preparing",
            loaded: 0,
            total: computedTotalSize ?? 0,
            percent: 0,
          };
          uploadProgressRef.current = initialUploadProgress;
          updatePublishProgress({
            stage: "uploadingOther",
            percent: publishStagePercent("uploadingOther"),
            loaded: 0,
            total: computedTotalSize ?? undefined,
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
          other = {
            paths: nextOtherPaths,
            url,
            size: computedTotalSize ?? archiveSize ?? 0,
            ...(selection.world ? { world: true } : {}),
          };
        }

        shouldUpdateLocalOther = true;
      }

      let updateImage = selectedVersion.version.image;
      if ((selection.logo || silentMode) && selectedVersion.version.image) {
        updatePublishProgress({
          stage: "uploadingLogo",
          percent: publishStagePercent("uploadingLogo"),
        });
        const tmpPath = await api.path.join(
          await api.other.getPath("temp"),
          `logo_${shareCode}.png`,
        );

        if (selectedVersion.version.image.startsWith("file://")) {
          if (
            !(await api.fs.copy(
              getLocalPathFromFileUrl(selectedVersion.version.image),
              tmpPath,
            ))
          ) {
            throw new Error("logo_failed");
          }
        } else {
          const response = await fetch(selectedVersion.version.image);
          if (!response.ok) throw new Error("logo_failed");
          const buffer = new Uint8Array(
            await (await response.blob()).arrayBuffer(),
          );
          if (!(await api.fs.writeFile(tmpPath, buffer))) {
            throw new Error("logo_failed");
          }
        }

        const upload = await api.backend.uploadFileFromPath(
          account.accessToken!,
          tmpPath,
          undefined,
          `modpacks/${shareCode}`,
        );

        await api.fs.rimraf(tmpPath);

        if (!upload) {
          if (uploadProgressRef.current?.statusCode === 413) {
            throw new Error("payload_too_large");
          }
          throw new Error("logo_failed");
        }

        updateImage = upload;
        uploadedImageUrl = upload;
        shouldUpdateLocalImage = true;
      }

      const update: IModpackUpdate = {
        build: nextBuild,
        name: selection.name ? selectedVersion.version.name : null,
        description:
          isDescriptionChanged || silentMode ? nextDescription : null,
        mods: selection.mods ? mods : null,
        servers: selection.servers ? servers : null,
        options: selection.options ? options : null,
        runArguments:
          selection.arguments && selectedVersion.version.runArguments
            ? selectedVersion.version.runArguments
            : null,
        other: isArchiveSelected ? other : null,
        image: selection.logo || silentMode ? updateImage : null,
        quickServer: selection.servers
          ? selectedVersion.version.quickServer || ""
          : null,
        isPublic: isCatalogPublic,
      };

      updatePublishProgress({
        stage: "publishing",
        percent: publishStagePercent("publishing"),
      });
      const isUpdated = await api.backend.updateModpack(
        account.accessToken!,
        shareCode,
        update,
      );
      if (!isUpdated) throw new Error("not updated");
      isRemoteCommitted = true;

      selectedVersion.version.description = nextDescription;
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
        versions[versionIndex].version.description = nextDescription;
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
          percent: publishStagePercent("saving"),
        });
        if (!(await selectedVersion.save())) {
          throw new Error("conf_not_saved");
        }
        setSelectedVersion(selectedVersion);
      }

      updatePublishProgress({
        stage: "completed",
        percent: publishStagePercent("completed"),
      });
      if (!silentMode) {
        toast.success(t("versions.published"));
        onPublished?.(shareCode);
      }
      return true;
    } catch (error) {
      const errorCode = resolvePublishErrorCode(error);
      publishErrorRef.current = errorCode;
      updatePublishProgress({
        stage: "error",
        percent: 100,
        errorCode,
        statusCode: uploadProgressRef.current?.statusCode,
        failedStage: publishStageRef.current ?? undefined,
      });
      for (const uploaded of orphanedPublishUploads({
        isRemoteCommitted,
        otherUrl: uploadedOtherUrl,
        imageUrl: uploadedImageUrl,
      })) {
        await api.backend
          .deleteFile(account.accessToken!, uploaded)
          .catch(() => undefined);
      }
      if (!silentMode) {
        showFailureToast(getPublishErrorToast(errorCode), error, {
          channels: ["backend:"],
        });
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
      showFailureToast(t("ownModpacks.deleteError"), undefined, {
        channels: ["backend:deleteModpack"],
      });

      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    const shareCode = selectedVersion.version.shareCode;
    const index = versions.findIndex(
      (v) => v.version.name === selectedVersion.version.name,
    );
    const listed =
      index !== -1 && versions[index].version.shareCode === shareCode
        ? versions[index]
        : null;

    applyUnpublish(selectedVersion.version, shareCode);
    if (listed && listed !== selectedVersion) {
      applyUnpublish(listed.version, shareCode);
    }

    const isConfSaved = await selectedVersion.save();
    announceShareCode(selectedVersion.version.name, "");

    if (listed) setVersions([...versions]);

    setIsLoading(false);
    setLoadingType(undefined);

    closeModal();

    if (!isConfSaved) {
      showFailureToast(t("versions.updateError"), undefined, {
        channels: ["version:save"],
      });
      return;
    }

    toast.success(t("ownModpacks.deleted"));
  }, [selectedVersion, account, authData, versions, closeModal, t]);

  const handlePublish = useCallback(async () => {
    if (!selectedVersion || !account || !authData) return;

    if (shareType === "update" && selectedVersion.version.shareCode) {
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
        percent: publishStagePercent("creatingShare"),
      });

      const shareCode = await api.backend.shareModpack(account.accessToken!, {
        isPublic: isCatalogPublic,
        conf: {
          ...selectedVersion.version,
          description: nextDescription,
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
          image: "",
          quickServer: "",
        },
      });

      if (!shareCode) throw new Error("not share code");
      createdShareCode = shareCode;

      const isUpdated = await updateShare(true, shareCode);
      if (!isUpdated) throw new Error("not updated");

      const index = versions.findIndex(
        (v) => v.version.name === selectedVersion.version.name,
      );
      const previousShareCode = selectedVersion.version.shareCode;
      selectedVersion.version.shareCode = shareCode;
      if (index !== -1) {
        versions[index].version.shareCode = shareCode;
        setVersions([...versions]);
      }

      if (!(await selectedVersion.save())) {
        selectedVersion.version.shareCode = previousShareCode;
        if (index !== -1) {
          versions[index].version.shareCode = previousShareCode;
          setVersions([...versions]);
        }
        throw new Error("conf_not_saved");
      }

      setSelectedVersion(selectedVersion);
      announceShareCode(selectedVersion.version.name, shareCode);
      onPublished?.(shareCode);
      void copyToClipboard(buildPackShareUrl(shareCode));

      toast.success(t("versions.published"));
      isPublished = true;
    } catch (error) {
      if (createdShareCode) {
        await api.backend
          .deleteModpack(account.accessToken!, createdShareCode)
          .catch(() => undefined);
      }
      const errorCode =
        publishErrorRef.current || resolvePublishErrorCode(error);
      showFailureToast(getPublishErrorToast(errorCode), error, {
        channels: ["backend:", "version:save", "fs:"],
      });
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
      if (isPublished) closeModal();
    }
  }, [
    account,
    authData,
    closeModal,
    isCatalogPublic,
    nextDescription,
    onPublished,
    selectedVersion,
    shareType,
    t,
    versions,
  ]);

  const shareUrl = selectedVersion?.version.shareCode
    ? buildPackShareUrl(selectedVersion.version.shareCode)
    : "";

  const isPublishing = isLoading && loadingType === "share";

  const isPublishDisabled =
    isLoading || !isNetwork || isOverLimit || readiness !== "ready";

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (open || isLoading) return;
        if (view === "files") {
          setView("plan");
          return;
        }
        closeModal();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "grid max-h-[min(38rem,calc(100vh-3rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg",
          view === "files" && "h-[min(38rem,calc(100vh-3rem))]",
        )}
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
          if (view === "files") {
            event.preventDefault();
            setView("plan");
          }
        }}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
          {view === "files" ? (
            <Button
              size="icon-sm"
              variant="ghost"
              className="-ml-1"
              aria-label={t("common.cancel")}
              onClick={() => setView("plan")}
            >
              <ChevronLeft />
            </Button>
          ) : (
            <Share2 className="size-4 shrink-0 text-faint" />
          )}
          <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
            {view === "files"
              ? t("share.publish.filesTitle")
              : t("versions.shareOptions")}
          </DialogTitle>
        </DialogHeader>

        {view === "files" && selectedVersion ? (
          <SelectPathsPanel
            loader={selectedVersion.version.loader.name}
            version={selectedVersion.version.version.id}
            pathFolder={
              selectPathsFolder ||
              (globalPaths?.minecraft
                ? globalPaths.minecraft
                : selectedVersion.versionPath)
            }
            selectedPaths={paths}
            onCancel={() => setView("plan")}
            onApply={handleSelectedOtherPaths}
          />
        ) : (
          <>
            <ScrollArea className="min-h-0">
              <div className="grid gap-3 px-4 py-3">
                <div className="grid gap-px rounded-xl border border-border bg-surface-2 p-1.5">
                  {fields.map((field) => {
                    const meta = fieldMeta(field.id);
                    const isChecked = field.available && selection[field.id];

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                          field.available || field.id === "other"
                            ? "hover:bg-surface-3"
                            : "opacity-45",
                        )}
                      >
                        <Checkbox
                          id={`publish-${field.id}`}
                          checked={isChecked}
                          disabled={!field.available || isLoading}
                          onCheckedChange={(checked) =>
                            toggleField(field.id, checked === true)
                          }
                        />
                        <label
                          htmlFor={`publish-${field.id}`}
                          className="min-w-0 flex-1 truncate"
                        >
                          {fieldLabel(field.id)}
                        </label>

                        {field.available && meta && (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                            {meta}
                          </span>
                        )}
                        {!field.available && field.id !== "other" && (
                          <span className="shrink-0 text-xs text-faint">
                            {shareType === "update"
                              ? t("share.publish.unavailableUpdate")
                              : t("share.publish.unavailableNew")}
                          </span>
                        )}

                        {field.id === "other" && (
                          <Hint content={t("share.publish.chooseFiles")}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("share.publish.chooseFiles")}
                              disabled={isLoading}
                              onClick={openOtherFilesSelector}
                            >
                              {isLoading && loadingType === "size" ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <FolderOpen />
                              )}
                            </Button>
                          </Hint>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isOverLimit && (
                  <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs leading-4 text-destructive">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {t("share.publish.overLimit")}
                  </p>
                )}

                {selection.world && (
                  <p className="text-xs leading-4 text-muted-foreground">
                    {t("share.publish.worldPrivacyHint")}
                  </p>
                )}

                {publishedHasWorld && selection.other && !selection.world && (
                  <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs leading-4 text-warning">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {t("share.publish.worldWillBeRemoved")}
                  </p>
                )}

                {selection.other &&
                  (selectedVersion?.version.downloadedVersion ||
                    (selectedVersion?.version.loader.mods.length ?? 0) > 0) && (
                    <p className="text-xs leading-4 text-muted-foreground">
                      {t("share.downloadedOtherFilesHint")}
                    </p>
                  )}

                <div className="grid gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                  <div className="grid gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <label
                        htmlFor="publish-description"
                        className="min-w-0 flex-1 truncate text-sm"
                      >
                        {t("share.description.label")}
                      </label>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                        {nextDescription.length}/{MODPACK_DESCRIPTION_MAX_CHARS}
                      </span>
                    </div>
                    <Textarea
                      id="publish-description"
                      value={description}
                      disabled={isLoading}
                      maxLength={MODPACK_DESCRIPTION_MAX_CHARS}
                      spellCheck={false}
                      placeholder={t("share.description.placeholder")}
                      onChange={(event) => setDescription(event.target.value)}
                      className="max-h-24 min-h-13 resize-none bg-background/40 text-xs leading-4"
                    />
                    <p className="text-xs leading-4 text-muted-foreground">
                      {t("share.description.hint")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{t("share.catalogPublic")}</p>
                      <p className="text-xs leading-4 text-muted-foreground">
                        {isPublishBanned
                          ? t("share.catalogPublicBanned")
                          : t("share.catalogPublicDescription")}
                      </p>
                      {isPublishBanned && publishBanReason && (
                        <p className="text-xs leading-4 text-warning">
                          {t("ownModpacks.publishBanReason", {
                            reason: publishBanReason,
                          })}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={isCatalogPublic && !isPublishBanned}
                      disabled={isLoading || isPublishBanned}
                      onCheckedChange={setIsCatalogPublic}
                    />
                  </div>
                </div>

                {shareUrl && (
                  <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5">
                    <Link2 className="size-3.5 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {shareUrl}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={t("common.copy")}
                          onClick={async () => {
                            if (!(await copyToClipboard(shareUrl))) return;
                            toast.success(t("common.copied"));
                          }}
                        >
                          <Copy />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("common.copy")}</TooltipContent>
                    </Tooltip>
                  </div>
                )}

                <Collapse show={isPublishing || !!publishProgress}>
                  {isPublishing || publishProgress ? (
                    <div
                      ref={progressRef}
                      className="grid gap-1.5 rounded-xl border border-border bg-surface-2 p-3"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span
                          className={
                            publishProgress?.stage === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {publishProgress
                            ? stageText(publishProgress.stage)
                            : t("share.publishProgress.starting")}
                        </span>
                        {publishProgress?.stage === "uploadingOther" &&
                        typeof publishProgress.loaded === "number" &&
                        typeof publishProgress.total === "number" ? (
                          <span className="shrink-0 font-mono tabular-nums text-faint">
                            {formatBytes(publishProgress.loaded, sizeLabels)}
                            {" / "}
                            {formatBytes(publishProgress.total, sizeLabels)}
                          </span>
                        ) : (
                          <span className="shrink-0 font-mono tabular-nums text-faint">
                            {publishProgress
                              ? `${Math.min(100, Math.max(0, publishProgress.percent))}%`
                              : "…"}
                          </span>
                        )}
                      </div>
                      <Progress
                        className={cn(
                          !publishProgress && "progress-sweep",
                          publishProgress?.stage === "error" &&
                            "bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive",
                        )}
                        value={
                          publishProgress
                            ? Math.min(
                                100,
                                Math.max(0, publishProgress.percent),
                              )
                            : 100
                        }
                      />
                      {publishProgress?.stage === "error" && (
                        <p className="text-xs leading-4 text-destructive">
                          {publishErrorText(
                            publishProgress.errorCode || "generic",
                          )}
                          {publishProgress.failedStage
                            ? ` (${stageText(publishProgress.failedStage)})`
                            : ""}
                        </p>
                      )}
                    </div>
                  ) : null}
                </Collapse>
              </div>
            </ScrollArea>

            <div className="grid gap-2 border-t border-border bg-surface-2 px-4 py-3">
              {isConfirmingDelete ? (
                <>
                  <p className="text-xs leading-4 text-muted-foreground">
                    {t("ownModpacks.confirmation", {
                      name: selectedVersion?.version.name,
                    })}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      disabled={isLoading}
                      onClick={() => setIsConfirmingDelete(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={isLoading}
                      onClick={async () => {
                        await handleDelete();
                        setIsConfirmingDelete(false);
                      }}
                    >
                      {isLoading && loadingType === "delete" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash />
                      )}
                      {t("common.delete")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs leading-4 text-muted-foreground">
                    {!isNetwork ? (
                      t("app.backendUnavailable")
                    ) : readiness === "noChanges" ? (
                      t("share.publish.noChanges")
                    ) : readiness === "nothingSelected" ? (
                      t("share.publish.pickWhatToUpdate")
                    ) : summary.length === 0 ? (
                      t("share.publish.onlyPack")
                    ) : (
                      <>
                        {t("share.publish.willSend")}{" "}
                        <span className="text-foreground">
                          {summary.map(partLabel).join(" · ")}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    {shareType === "update" && (
                      <Button
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={isLoading}
                        onClick={() => setIsConfirmingDelete(true)}
                      >
                        <Trash />
                        {t("common.delete")}
                      </Button>
                    )}
                    <Button
                      className="ml-auto"
                      disabled={isPublishDisabled}
                      onClick={() => void handlePublish()}
                    >
                      {isLoading && loadingType === "share" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <ArrowUpFromLine />
                      )}
                      {shareType === "new"
                        ? t("versions.share")
                        : t("common.update")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
