import {
  Loader2,
  RotateCcw,
  RotateCw,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { createRef, useEffect, useState } from "react";
import Cropper, { ReactCropperElement } from "react-cropper";
import { useTranslation } from "react-i18next";
import "cropperjs/dist/cropper.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Hint } from "./Hint";
import { getLocalPathFromFileUrl } from "@renderer/utilities/exportVersion";

const api = window.api;

export function ImageCropper({
  title,
  image,
  size,
  onClose,
  changeImage,
  changeImageBlob,
}: {
  title: string;
  image: string;
  size: {
    width: number;
    height: number;
  };
  onClose: () => void;
  changeImage?: (url: string) => void;
  changeImageBlob?: (blob: Blob) => boolean | Promise<boolean>;
}) {
  const cropperRef = createRef<ReactCropperElement>();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [isUnreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setResolvedSrc(null);
    setUnreadable(false);
    void (async () => {
      let source = image;

      if (!/^(https?:|data:|blob:)/i.test(image)) {
        const localPath = image.startsWith("file://")
          ? getLocalPathFromFileUrl(image)
          : image;
        const buffer = await api.fs.readFileBuffer(localPath);
        if (!active) return;
        if (!buffer) {
          setUnreadable(true);
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([buffer]));
        source = objectUrl;
      }

      const probe = new Image();
      probe.src = source;
      try {
        await probe.decode();
      } catch {
        if (active) setUnreadable(true);
        return;
      }

      if (!active) return;
      setResolvedSrc(source);
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image]);

  const getCropData = async () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;

    setIsSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        cropper
          .getCroppedCanvas({ width: size.width, height: size.height })
          .toBlob(resolve),
      );
      if (!blob) {
        toast.error(t("imageCropper.cropFailed"));
        return;
      }

      if (changeImageBlob) {
        if (!(await changeImageBlob(blob))) return;
      } else {
        changeImage?.(URL.createObjectURL(blob));
      }

      onClose();
    } catch {
      toast.error(t("imageCropper.cropFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const control = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
  ) => (
    <Hint content={label}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={label}
        disabled={isSaving || !resolvedSrc}
        onClick={action}
      >
        {icon}
      </Button>
    </Hint>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!isSaving}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
          <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-background">
          <Cropper
            ref={cropperRef}
            style={{ height: 320, width: "100%" }}
            initialAspectRatio={size.width / size.height}
            src={resolvedSrc ?? undefined}
            viewMode={1}
            minCropBoxHeight={size.height}
            minCropBoxWidth={size.width}
            cropBoxResizable={false}
            background={false}
            responsive={false}
            checkOrientation={false}
            guides={true}
            dragMode="move"
            rotatable={true}
          />

          {isUnreadable && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background p-6 text-center">
              <p className="text-sm text-foreground">
                {t("imageCropper.loadFailed")}
              </p>
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {image}
              </p>
            </div>
          )}

          {!resolvedSrc && !isUnreadable && (
            <div
              aria-busy
              className="absolute inset-0 flex items-center justify-center bg-background p-6"
            >
              <Skeleton
                className="rounded-lg"
                style={{
                  aspectRatio: `${size.width} / ${size.height}`,
                  maxWidth: "100%",
                  maxHeight: "100%",
                  height: "100%",
                }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-border px-3 py-2">
          {control(t("imageCropper.zoomIn"), <ZoomIn />, () =>
            cropperRef.current?.cropper.zoom(0.1),
          )}
          {control(t("imageCropper.zoomOut"), <ZoomOut />, () =>
            cropperRef.current?.cropper.zoom(-0.1),
          )}
          {control(t("imageCropper.rotateLeft"), <RotateCcw />, () =>
            cropperRef.current?.cropper.rotate(-90),
          )}
          {control(t("imageCropper.rotateRight"), <RotateCw />, () =>
            cropperRef.current?.cropper.rotate(90),
          )}

          <span className="ml-auto font-mono text-[0.7rem] tabular-nums text-faint">
            {size.width}×{size.height}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-1 px-4 py-3">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={getCropData} disabled={isSaving || !resolvedSrc}>
            {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
