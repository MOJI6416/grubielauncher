import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { MAX_PENDING_IMAGES } from "./chatAttachments";

export interface PendingImage {
  id: string;
  file: File;
  url: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentTray({
  items,
  uploadingId,
  onRemove,
  onAdd,
}: {
  items: PendingImage[];
  uploadingId: string | null;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const isBusy = uploadingId !== null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const isUploading = item.id === uploadingId;

        return (
          <Hint
            key={item.id}
            content={`${item.file.name} · ${formatSize(item.file.size)}`}
            variant="text"
          >
            <div className="group/tile relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2 animate-in fade-in-0 zoom-in-95 duration-150">
              <img
                src={item.url}
                alt=""
                draggable={false}
                className={cn(
                  "size-full object-cover",
                  isUploading && "opacity-50",
                )}
              />
              {isUploading ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-foreground" />
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  aria-label={t("friends.chatRemoveAttachment")}
                  className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-md border border-border bg-surface-1/90 text-muted-foreground opacity-0 transition-opacity group-hover/tile:opacity-100 hover:text-foreground focus-visible:opacity-100 disabled:hidden"
                  onClick={() => onRemove(item.id)}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </Hint>
        );
      })}

      {items.length < MAX_PENDING_IMAGES && (
        <Hint content={t("friends.chatAttachImage")}>
          <button
            type="button"
            disabled={isBusy}
            aria-label={t("friends.chatAttachImage")}
            className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-faint transition-colors hover:border-ring hover:text-foreground disabled:opacity-50"
            onClick={onAdd}
          >
            <ImagePlus className="size-4" />
          </button>
        </Hint>
      )}
    </div>
  );
}
