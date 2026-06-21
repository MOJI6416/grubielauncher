import { Loader2, Save } from "lucide-react";
import { createRef, useState } from "react";
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

export function ImageCropper({
  title,
  image,
  size,
  onClose,
  changeImage,
}: {
  title: string;
  image: string;
  size: {
    width: number;
    height: number;
  };
  onClose: () => void;
  changeImage: (url: string) => void;
}) {
  const cropperRef = createRef<ReactCropperElement>();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);

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
        await changeImage(URL.createObjectURL(blob));
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
            src={image}
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
