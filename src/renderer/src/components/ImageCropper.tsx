import { Save } from 'lucide-react'
import { createRef } from 'react'
import Cropper, { ReactCropperElement } from 'react-cropper'
import { useTranslation } from 'react-i18next'
import 'cropperjs/dist/cropper.css'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function ImageCropper({
  title,
  image,
  size,
  onClose,
  changeImage
}: {
  title: string
  image: string
  size: {
    width: number
    height: number
  }
  onClose: () => void
  changeImage: (url: string) => void
}) {
  const cropperRef = createRef<ReactCropperElement>()
  const { t } = useTranslation()

  const getCropData = async () => {
    if (typeof cropperRef.current?.cropper !== 'undefined') {
      cropperRef.current?.cropper
        .getCroppedCanvas({
          width: size.width,
          height: size.height
        })
        .toBlob(async (blob) => {
          if (blob) {
            await changeImage(URL.createObjectURL(blob))
            onClose()
          }
        })
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="p-1">
            <Cropper
              className="rounded-3xl"
              ref={cropperRef}
              style={{ height: 350, width: '100%' }}
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
          <div className="flex gap-2 items-center">
            <Button
              onClick={async () => {
                await getCropData()
              }}
            >
              <Save className="size-4" />
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
