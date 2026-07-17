import { Loader2, Save } from "lucide-react";
import { createRef, useEffect, useState } from "react";
import Cropper, { ReactCropperElement } from "react-cropper";
import { useTranslation } from "react-i18next";
import "cropperjs/dist/cropper.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  changeImageBlob?: (blob: Blob) => void | Promise<void>;
}) {
  const cropperRef = createRef<ReactCropperElement>();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (/^(https?:|data:|blob:)/i.test(image)) {
      setResolvedSrc(image);
      return;
    }

    const localPath = image.startsWith("file://")
      ? getLocalPathFromFileUrl(image)
      : image;
    let active = true;
    let objectUrl: string | null = null;

    setResolvedSrc(null);
    void (async () => {
      const buffer = await api.fs.readFileBuffer(localPath);
      if (!active) return;
      if (!buffer) {
        setResolvedSrc(image);
        return;
      }
      objectUrl = URL.createObjectURL(new Blob([buffer]));
      setResolvedSrc(objectUrl);
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
      if (blob) {
        if (changeImageBlob) {
          await changeImageBlob(blob);
        } else {
          changeImage?.(URL.createObjectURL(blob));
        }
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="p-1">
          <Cropper
            className="rounded-xl"
            ref={cropperRef}
            style={{ height: 350, width: "100%" }}
            initialAspectRatio={1}
            preview=".img-preview"
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
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={getCropData} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
