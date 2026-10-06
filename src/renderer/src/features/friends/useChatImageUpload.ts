import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { uploadChatImage } from "@renderer/utilities/chatUpload";
import { showFailureToast } from "@renderer/utilities/failures";
import { uploadFailure } from "./uploadFailure";
import { isChatImageFile } from "./chatAttachments";

export function useChatImageUpload({
  accessToken,
  ownUserIdRef,
  onUploaded,
}: {
  accessToken?: string;
  ownUserIdRef: RefObject<string | undefined>;
  onUploaded: (url: string) => boolean;
}) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const sendImageFile = useCallback(
    async (file: File): Promise<boolean> => {
      const own = ownUserIdRef.current;
      if (!accessToken || !own || !isChatImageFile(file)) return false;

      const controller = new AbortController();
      abortRef.current = controller;
      setProgress(0);

      try {
        const safeName = (file.name || "image.png").trim() || "image.png";
        const url = await uploadChatImage({
          accessToken,
          file,
          fileName: `chat_${Date.now()}_${safeName}`,
          folder: `chat/${own}`,
          onProgress: setProgress,
          signal: controller.signal,
        });
        setProgress(null);
        return onUploaded(url);
      } catch (error) {
        setProgress(null);
        if (controller.signal.aborted) return false;

        if (error instanceof Error && error.message === "upload_timeout") {
          toast.warning(t("friends.chatImageUploadError"), {
            description: t("friends.operationErrors.timeout"),
          });
          return false;
        }

        showFailureToast(t("friends.chatImageUploadError"), uploadFailure(error), {
          channels: ["backend:"],
          context: { side: "grubie" },
        });
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [accessToken, onUploaded, ownUserIdRef, t],
  );

  const cancelImageUpload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    imageUploadProgress: progress,
    isUploading: progress !== null,
    sendImageFile,
    cancelImageUpload,
  };
}
