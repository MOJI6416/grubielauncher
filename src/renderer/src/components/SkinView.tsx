import { ISkinData } from '@/types/Skin'
import {
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  NumberInput,
  Radio,
  RadioGroup
} from '@heroui/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactSkinview3d from 'react-skinview3d'
import {
  WalkingAnimation,
  SkinViewer,
  IdleAnimation,
  FlyingAnimation,
  RunningAnimation
} from 'skinview3d'

type Animation = 'null' | 'idle' | 'walk' | 'run' | 'fly'

export function SkinView({
  skinData,
  onClose,
  nickname,
  isOwner,
  setScreenshotFile
}: {
  skinData: ISkinData
  nickname?: string
  isOwner: boolean
  onClose: () => void
  setScreenshotFile?: (data: string) => void
}) {
  const [animationState, setAnimationState] = useState<Animation>('null')
  const [isNameTag, setIsNameTag] = useState(true)
  const viewerRef = useRef<SkinViewer>(null)

  const { t } = useTranslation()

  function setAnimation(animation: Animation) {
    if (!viewerRef.current) return

    setAnimationState(animation)
    switch (animation) {
      case 'idle':
        viewerRef.current.animation = new IdleAnimation()
        break
      case 'walk':
        viewerRef.current.animation = new WalkingAnimation()
        break
      case 'run':
        viewerRef.current.animation = new RunningAnimation()
        break
      case 'fly':
        viewerRef.current.animation = new FlyingAnimation()
        break
      default:
        viewerRef.current.animation = null
        break
    }
  }

  return (
    <Modal
      scrollBehavior="outside"
      size="xl"
      isOpen={true}
      onClose={() => {
        onClose()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('skinView.title')}</ModalHeader>

        <ModalBody>
          <div className="flex gap-2 justify-between">
            <div className="max-w-96">
              <ReactSkinview3d
                skinUrl={skinData.skin}
                capeUrl={skinData.cape}
                height={400}
                width={250}
                options={{
                  nameTag: nickname,
                  zoom: 0.75,
                  preserveDrawingBuffer: true
                }}
                onReady={({ viewer }) => {
                  viewerRef.current = viewer
                }}
              />
            </div>

            <div className="flex flex-col gap-4 items-center w-8/12">
              <div className="flex flex-col gap-1 text-center">
                <p className="text-sm font-bold">{t('skinView.rotation')}</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    onChange={(event) => {
                      if (!viewerRef.current) return
                      const isChecked = event.target.checked
                      viewerRef.current.autoRotate = isChecked
                    }}
                    size="sm"
                  >
                    {t('skinView.rotate')}
                  </Checkbox>

                  <span>
                    <NumberInput
                      label={t('skinView.speed')}
                      size="sm"
                      className="w-36"
                      onValueChange={(value) => {
                        if (!viewerRef.current) return
                        viewerRef.current.autoRotateSpeed = value
                      }}
                    />
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-center">
                <p className="text-sm font-bold">{t('skinView.animation')}</p>
                <RadioGroup
                  orientation="horizontal"
                  value={animationState}
                  onValueChange={(value) => setAnimation(value as Animation)}
                >
                  <Radio value="null" size="sm" onChange={() => setAnimation('null')}>
                    {t('skinView.animations.0')}
                  </Radio>
                  <Radio value="idle" size="sm">
                    {t('skinView.animations.1')}
                  </Radio>
                  <Radio value="walk" size="sm">
                    {t('skinView.animations.2')}
                  </Radio>
                  <Radio value="run" size="sm">
                    {t('skinView.animations.3')}
                  </Radio>
                  <Radio value="fly" size="sm">
                    {t('skinView.animations.4')}
                  </Radio>
                </RadioGroup>
              </div>
              <div className="flex flex-col gap-1 text-center">
                <p className="font-bold text-sm">{t('skinView.additionally')}</p>
                <div className="flex flex-col gap-1">
                  <Checkbox
                    onChange={(event) => {
                      if (!viewerRef.current) return
                      const isChecked = event.target.checked

                      setIsNameTag(isChecked)
                      viewerRef.current.nameTag = isChecked ? nickname || null : null
                    }}
                    isSelected={isNameTag}
                    size="sm"
                  >
                    {t('skinView.showName')}
                  </Checkbox>

                  {isOwner ? (
                    <Button
                      variant="flat"
                      size="sm"
                      onPress={() => {
                        if (!viewerRef.current || !setScreenshotFile) return
                        const iconUrl = viewerRef.current.canvas.toDataURL('image/png')

                        setScreenshotFile(iconUrl)
                      }}
                    >
                      {t('skinView.setAvatat')}
                    </Button>
                  ) : undefined}
                </div>
              </div>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
