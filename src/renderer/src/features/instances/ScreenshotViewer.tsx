import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, FolderOpen, ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import {
  MediaViewer,
  MediaViewerAction,
  type MediaViewerItem,
} from "@renderer/components/mediaViewer/MediaViewer";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { toFileUrl } from "@renderer/utilities/exportVersion";
import { screenshotLabel, sortScreenshots } from "./instanceOverview";
import { bumpInstanceDataRevision } from "./instanceRevision";
import type { InstanceScreenshot } from "./useInstanceInsights";
import { captureCopyAnchor, flashCopied } from "@renderer/utilities/copyFeedback";

const api = window.api;

function shotSource(file: string) {
  return resolveLocalImage(toFileUrl(file));
}

export function ScreenshotViewer({
  folder,
  initialPath,
  onClose,
  onUseAsCover,
}: {
  folder: string;
  initialPath: string;
  onClose: () => void;
  onUseAsCover?: (file: string) => void;
}) {
  const { t } = useTranslation();
  const [shots, setShots] = useState<InstanceScreenshot[] | null>(null);
  const [index, setIndex] = useState(0);
  const [isDeleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const names = sortScreenshots(
        await api.fs.readdir(folder).catch(() => [] as string[]),
      );
      const list = await Promise.all(
        names.map(async (name) => ({
          name,
          path: await api.path.join(folder, name),
        })),
      );
      if (cancelled) return;
      setShots(list);
      setIndex(
        Math.max(
          0,
          list.findIndex((shot) => shot.path === initialPath),
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [folder, initialPath]);

  const current = shots?.[index];

  const items = useMemo<MediaViewerItem[]>(
    () =>
      (shots ?? []).map((shot) => ({
        key: shot.path,
        src: shotSource(shot.path),
        alt: screenshotLabel(shot.name),
        title: screenshotLabel(shot.name),
        subtitle: shot.name,
      })),
    [shots],
  );

  const copy = useCallback(async () => {
    if (!current) return;
    const anchor = captureCopyAnchor();
    const ok = await api.clipboard.writeImage(current.path).catch(() => false);
    if (ok) flashCopied(anchor);
    else toast.error(t("common.copyFailed"));
  }, [current, t]);

  const remove = useCallback(async () => {
    if (!current) return;
    const ok = await api.shell.trashItem(current.path).catch(() => false);
    if (!ok) {
      toast.error(t("versions.screenshots.deleteFailed"));
      return;
    }

    bumpInstanceDataRevision();
    toast.success(t("versions.screenshots.deleted"));
    const next = (shots ?? []).filter((shot) => shot.path !== current.path);
    if (next.length === 0) {
      onClose();
      return;
    }
    setShots(next);
    setIndex((value) => Math.min(value, next.length - 1));
  }, [current, onClose, shots, t]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Delete") {
        setDeleteOpen(true);
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        void copy();
        return true;
      }
      return false;
    },
    [copy],
  );

  if (!shots) return null;

  return (
    <>
      <MediaViewer
        title={t("versions.screenshots.title")}
        items={items}
        index={index}
        onIndexChange={setIndex}
        onClose={onClose}
        keysDisabled={isDeleteOpen}
        onKeyDown={handleKeyDown}
        actions={() =>
          current && (
            <>
              <MediaViewerAction
                label={t("versions.screenshots.copy")}
                onClick={() => void copy()}
              >
                <Copy />
              </MediaViewerAction>
              <MediaViewerAction
                label={t("versions.screenshots.showInFolder")}
                onClick={() => void api.shell.showItemInFolder(current.path)}
              >
                <FolderOpen />
              </MediaViewerAction>
              <MediaViewerAction
                label={t("versions.screenshots.openExternal")}
                onClick={() => void api.shell.openPath(current.path)}
              >
                <ExternalLink />
              </MediaViewerAction>
              {onUseAsCover && (
                <MediaViewerAction
                  label={t("versions.screenshots.useAsCover")}
                  onClick={() => {
                    onUseAsCover(current.path);
                    onClose();
                  }}
                >
                  <ImageUp />
                </MediaViewerAction>
              )}
              <MediaViewerAction
                label={t("versions.screenshots.delete")}
                onClick={() => setDeleteOpen(true)}
                danger
              >
                <Trash2 />
              </MediaViewerAction>
            </>
          )
        }
      />

      {isDeleteOpen && current && (
        <Confirmation
          title={t("versions.screenshots.deleteTitle")}
          reversible
          content={[{ text: t("versions.screenshots.deleteBody") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setDeleteOpen(false),
            },
            {
              text: t("versions.screenshots.delete"),
              color: "danger",
              onClick: async () => {
                setDeleteOpen(false);
                await remove();
              },
            },
          ]}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}
