import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, FolderOpen, ImageUp, Trash2 } from "lucide-react";
import { showFailureToast } from "@renderer/utilities/failures";
import { removeWithUndo } from "@renderer/utilities/removeWithUndo";
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
import { countFeature } from "@renderer/features/usage/usage";

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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const names = sortScreenshots(
        await api.fs.readdir(folder).catch((error) => {
          showFailureToast(t("versions.screenshots.loadFailed"), error, {
            channels: ["fs:readdir"],
          });
          return [] as string[];
        }),
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
  }, [folder, initialPath, t]);

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
    countFeature("screenshots.copy");
    const anchor = captureCopyAnchor();
    const fail = (error?: unknown) =>
      showFailureToast(t("common.copyFailed"), error, {
        channels: ["clipboard:writeImage"],
        fallbackDescription: t("common.copyFailedHint"),
      });

    try {
      if (await api.clipboard.writeImage(current.path)) flashCopied(anchor);
      else fail();
    } catch (error) {
      fail(error);
    }
  }, [current, t]);

  const remove = useCallback(async () => {
    if (!current || !shots) return;
    const removed = current;
    const position = shots.findIndex((shot) => shot.path === removed.path);
    const removedOk = await removeWithUndo({
      target: removed.path,
      parkDir: api.path.join(removed.path, "..", ".."),
      title: t("versions.screenshots.deleted"),
      description: t("versions.screenshots.deletedHint"),
      failTitle: t("versions.screenshots.deleteFailed"),
      onRemoved: bumpInstanceDataRevision,
      onRestored: () => {
        bumpInstanceDataRevision();
        setShots((list) => {
          if (!list || list.some((shot) => shot.path === removed.path)) {
            return list;
          }
          const restored = [...list];
          restored.splice(Math.min(position, restored.length), 0, removed);
          return restored;
        });
      },
    });
    if (!removedOk) return;

    const next = shots.filter((shot) => shot.path !== removed.path);
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
        void remove();
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        void copy();
        return true;
      }
      return false;
    },
    [copy, remove],
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
                    countFeature("screenshots.cover");
                    onUseAsCover(current.path);
                    onClose();
                  }}
                >
                  <ImageUp />
                </MediaViewerAction>
              )}
              <MediaViewerAction
                label={t("versions.screenshots.delete")}
                onClick={() => void remove()}
                danger
              >
                <Trash2 />
              </MediaViewerAction>
            </>
          )
        }
      />
    </>
  );
}
