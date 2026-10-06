import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Download, ExternalLink, MessageSquareText } from "lucide-react";
import {
  MediaViewer,
  MediaViewerAction,
  type MediaViewerItem,
} from "@renderer/components/mediaViewer/MediaViewer";
import {
  copyRemoteImage,
  remoteImageName,
  saveRemoteImage,
} from "@renderer/utilities/remoteImage";

const api = window.api;

export function chatImageFileName(url: string, fallback: string): string {
  return remoteImageName(url, fallback).replace(/^chat_\d+_/, "") || fallback;
}

export function ChatImageViewer({
  items,
  activeKey,
  onActiveKeyChange,
  onClose,
  onShowInChat,
}: {
  items: MediaViewerItem[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  onClose: () => void;
  onShowInChat: (key: string) => void;
}) {
  const { t } = useTranslation();
  const index = items.findIndex((item) => item.key === activeKey);

  useEffect(() => {
    if (index < 0) onClose();
  }, [index, onClose]);

  const save = useCallback(
    (item: MediaViewerItem) =>
      void saveRemoteImage(item.src, chatImageFileName(item.src, t("friends.chatImage"))),
    [t],
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
        save(item);
        return true;
      }
      return false;
    },
    [save],
  );

  if (index < 0) return null;

  return (
    <MediaViewer
      title={t("friends.chatImage")}
      items={items}
      index={index}
      onIndexChange={(next) => {
        const item = items[next];
        if (item) onActiveKeyChange(item.key);
      }}
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
          <MediaViewerAction label={t("mediaViewer.save")} onClick={() => save(item)}>
            <Download />
          </MediaViewerAction>
          <MediaViewerAction
            label={t("mediaViewer.openExternal")}
            onClick={() => void api.shell.openExternal(item.src)}
          >
            <ExternalLink />
          </MediaViewerAction>
          <MediaViewerAction
            label={t("mediaViewer.showInChat")}
            onClick={() => onShowInChat(item.key)}
          >
            <MessageSquareText />
          </MediaViewerAction>
        </>
      )}
    />
  );
}
