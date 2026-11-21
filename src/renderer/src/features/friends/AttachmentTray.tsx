import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { formatBytes } from "@renderer/utilities/file";

export interface PendingImage {
  id: string;
  file: File;
  url: string;
}

export function AttachmentTray({
  items,
  uploadingId,
  onRemove,
}: {
  items: PendingImage[];
  uploadingId: string | null;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const isBusy = uploadingId !== null;
  const sizes = [0, 1, 2, 3, 4].map((index) => t(`sizes.${index}`));

  return (
    <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const isUploading = item.id === uploadingId;

        return (
          <div
            key={item.id}
            className="group/tile relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2 animate-in fade-in-0 zoom-in-95 duration-150"
          >
            <Hint
              content={`${item.file.name} · ${formatBytes(item.file.size, sizes, 1)}`}
              variant="text"
            >
              <img
                src={item.url}
                alt=""
                draggable={false}
                className={cn(
                  "size-full object-cover",
                  isUploading && "opacity-50",
                )}
              />
            </Hint>
            {isUploading ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-4 animate-spin text-foreground" />
              </span>
            ) : (
              <Hint content={t("friends.chatRemoveAttachment")}>
                <button
                  type="button"
                  disabled={isBusy}
                  aria-label={t("friends.chatRemoveAttachment")}
                  className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-md border border-border bg-surface-1/90 text-muted-foreground opacity-0 transition-opacity group-hover/tile:opacity-100 hover:text-foreground focus-visible:opacity-100 disabled:hidden"
                  onClick={() => onRemove(item.id)}
                >
                  <X className="size-3" />
                </button>
              </Hint>
            )}
          </div>
        );
      })}
    </div>
  );
}
