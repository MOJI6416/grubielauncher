import { Save } from 'lucide-react'
import { createRef } from 'react'
import Cropper, { ReactCropperElement } from 'react-cropper'
import { useTranslation } from 'react-i18next'
import 'cropperjs/dist/cropper.css'
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react'

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
    <Modal isOpen={true} onClose={onClose}>
      <ModalContent>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>
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
                checkOrientation={false} // https://github.com/fengyuanchen/cropperjs/issues/671
                guides={true}
                dragMode="move"
                rotatable={true}
              />
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="flat"
                color="success"
                startContent={<Save size={22} />}
                onPress={async () => {
                  await getCropData()
                }}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
