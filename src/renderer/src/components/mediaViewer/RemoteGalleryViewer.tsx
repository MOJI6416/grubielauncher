import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Download, ExternalLink } from "lucide-react";
import {
  copyRemoteImage,
  remoteImageName,
  saveRemoteImage,
} from "@renderer/utilities/remoteImage";
import {
  MediaViewer,
  MediaViewerAction,
  type MediaViewerItem,
} from "./MediaViewer";

const api = window.api;

export interface RemoteGalleryImage {
  url: string;
  thumbnail?: string;
  title?: string;
  description?: string;
}

export function RemoteGalleryViewer({
  images,
  startIndex,
  title,
  onClose,
}: {
  images: RemoteGalleryImage[];
  startIndex: number;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);

  const items = useMemo<MediaViewerItem[]>(
    () =>
      images.map((image, position) => ({
        key: `${position}:${image.url}`,
        src: image.url,
        thumbnail: image.thumbnail,
        alt: image.title || image.description || "",
        title: image.title || title,
        subtitle: image.title ? image.description : undefined,
      })),
    [images, title],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent, item: MediaViewerItem) => {
      if (!(event.ctrlKey || event.metaKey)) return false;
      const key = event.key.toLowerCase();
      if (key === "c") {
        void copyRemoteImage(item.src);
        return true;
      }
      if (key === "s") {
        void saveRemoteImage(item.src, remoteImageName(item.src, title));
        return true;
      }
      return false;
    },
    [title],
  );

  return (
    <MediaViewer
      title={title}
      items={items}
      index={index}
      onIndexChange={setIndex}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      actions={(item) => (
        <>
          <MediaViewerAction
            label={t("mediaViewer.copy")}
            onClick={() => void copyRemoteImage(item.src)}
          >
            <Copy />
          </MediaViewerAction>
          <MediaViewerAction
            label={t("mediaViewer.save")}
            onClick={() =>
              void saveRemoteImage(item.src, remoteImageName(item.src, title))
            }
          >
            <Download />
          </MediaViewerAction>
          <MediaViewerAction
            label={t("mediaViewer.openExternal")}
            onClick={() => void api.shell.openExternal(item.src)}
          >
            <ExternalLink />
          </MediaViewerAction>
        </>
      )}
    />
  );
}
