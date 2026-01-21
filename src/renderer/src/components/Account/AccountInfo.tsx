import { IUser } from '@/types/IUser'
import { useTranslation } from 'react-i18next'
import { Award, Save, Settings2, Shirt } from 'lucide-react'
import { SkinView } from '../SkinView'
import { ImageCropper } from '../ImageCropper'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom } from 'jotai'
import { accountAtom, accountsAtom, authDataAtom, pathsAtom } from '@renderer/stores/atoms'
import {
  addToast,
  Avatar,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip
} from '@heroui/react'
import { ManageSkins } from '../ManageSkins'
import { ILocalAccount } from '@/types/Account'
import { ISkinData } from '@/types/Skin'
import pt100 from '@renderer/assets/achievements/pt100.png'
import pt500 from '@renderer/assets/achievements/pt500.png'
import pt1000 from '@renderer/assets/achievements/pt1000.png'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Achievements } from './Achievements'
import { formatDate, formatTime } from '@renderer/utilities/date'
import axios from 'axios'

const api = window.api

type LoadingType = 'skin' | 'save' | 'manageSkins' | null

const ACH_ICON: Record<string, string> = {
  pt100,
  pt500,
  pt1000
}

export default function AccountInfo({
  onClose,
  user,
  isOwner
}: {
  onClose: () => void
  user: IUser
  isOwner: boolean
}) {
  const { t } = useTranslation()

  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<LoadingType>(null)

  const [skinData, setSkinData] = useState<ISkinData>({ skin: 'steve' })
  const [skinModal, setSkinModal] = useState(false)

  const [croppedImage, setCroppedImage] = useState<string>('')
  const [isCropping, setIsCropping] = useState(false)

  const [image, setImage] = useState<string | null>(user.image ?? null)

  const [localAccount, setLocalAccount] = useAtom(accountAtom)
  const [accounts, setAccounts] = useAtom(accountsAtom)
  const [paths] = useAtom(pathsAtom)
  const [authData] = useAtom(authDataAtom)

  const [isManageSkins, setIsManageSkins] = useState(false)
  const [isAchievements, setIsAchievements] = useState(false)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const userKey = `${user._id}_${user.nickname}_${user.platform}`
  useEffect(() => {
    setImage(user.image ?? null)
  }, [userKey])

  const autoplay = useMemo(
    () =>
      Autoplay({
        delay: 2500,
        stopOnInteraction: false,
        stopOnMouseEnter: true
      }),
    []
  )
  const [emblaRef] = useEmblaCarousel({ loop: false, dragFree: true, align: 'start' }, [autoplay])

  const startLoading = useCallback((type: Exclude<LoadingType, null>) => {
    setIsLoading(true)
    setLoadingType(type)
  }, [])

  const stopLoading = useCallback(() => {
    setIsLoading(false)
    setLoadingType(null)
  }, [])

  const isOwnerLocal = useMemo(() => {
    return Boolean(isOwner && localAccount?.nickname === user.nickname)
  }, [isOwner, localAccount?.nickname, user.nickname])

  const canSave = useMemo(() => {
    if (!isOwner) return false
    if (!localAccount) return false
    if (!image) return false
    if (isLoading) return false
    return image !== (localAccount.image ?? null)
  }, [isOwner, localAccount, image, isLoading])

  const handleChooseAvatar = useCallback(async () => {
    if (!isOwner || isLoading) return

    const filePaths = await api.other.openFileDialog()
    if (!filePaths || filePaths.length === 0) return

    setCroppedImage(filePaths[0])
    setIsCropping(true)
  }, [isOwner, isLoading])

  const handleSaveAvatar = useCallback(async () => {
    if (!canSave || !localAccount || !image) return

    startLoading('save')
    try {
      const response = await axios.get(image, {
        responseType: 'arraybuffer'
      })

      const buffer = api.file.fromBuffer(response.data)

      const fileName = `${user._id}.png`
      const tmpDir = await api.other.getPath('temp')
      const tmpPath = await api.path.join(tmpDir, fileName)

      await api.fs.writeFile(tmpPath, buffer, 'binary')

      const url = await api.backend.uploadFileFromPath(
        localAccount.accessToken || '',
        tmpPath,
        undefined,
        'avatars'
      )

      await api.fs.rimraf(tmpPath)

      if (!url) throw new Error('Upload failed')

      if (localAccount.accessToken) {
        await api.backend.updateUser(localAccount.accessToken, user._id, { image: url })
      }

      const updatedLocalAccount = { ...localAccount, image: url }
      const updatedAccounts = accounts.map((a: ILocalAccount) =>
        a.nickname === localAccount.nickname && a.type === localAccount.type
          ? { ...a, image: url }
          : a
      )

      setLocalAccount(updatedLocalAccount)
      setAccounts(updatedAccounts)

      await api.accounts.save(
        updatedAccounts,
        `${updatedLocalAccount.type}_${updatedLocalAccount.nickname}`,
        paths.launcher
      )

      setImage(url)

      addToast({ color: 'success', title: t('accountInfo.updated') })
    } catch {
      addToast({ color: 'danger', title: t('accountInfo.updateError') })
    } finally {
      stopLoading()
    }
  }, [
    canSave,
    localAccount,
    image,
    user._id,
    accounts,
    paths.launcher,
    setAccounts,
    setLocalAccount,
    t,
    startLoading,
    stopLoading
  ])

  const handleOpenSkin = useCallback(async () => {
    if (isLoading) return

    startLoading('skin')
    try {
      const data = await api.skin.get(
        user.platform,
        user.uuid,
        user.nickname,
        localAccount?.accessToken
      )

      if (!data) {
        addToast({ color: 'danger', title: t('skinView.error') })
        return
      }

      setSkinData(data)
      setSkinModal(true)
    } finally {
      stopLoading()
    }
  }, [
    isLoading,
    user.platform,
    user.uuid,
    user.nickname,
    localAccount?.accessToken,
    t,
    startLoading,
    stopLoading
  ])

  const handleManageSkins = useCallback(async () => {
    if (isLoading) return

    if (user.platform === 'elyby') {
      await api.shell.openExternal('https://ely.by/skins')
      return
    }

    if (!authData || !localAccount || !localAccount.accessToken) return

    startLoading('manageSkins')
    try {
      if (user.platform === 'microsoft' && authData.auth.expiresAt && authData.auth.refreshToken) {
        const { expiresAt, refreshToken } = authData.auth

        if (Date.now() > expiresAt) {
          const authUser = await api.auth.microsoftRefresh(refreshToken, authData.sub)
          if (!authUser) throw new Error('Refresh failed')

          const newData = { ...localAccount, ...authUser }
          const updatedAccounts = accounts.map((a: ILocalAccount) =>
            a.nickname === localAccount.nickname && a.type === localAccount.type ? newData : a
          )

          setLocalAccount(newData)
          setAccounts(updatedAccounts)

          await api.accounts.save(
            updatedAccounts,
            `${newData.type}_${newData.nickname}`,
            paths.launcher
          )
        }
      }

      setIsManageSkins(true)
    } catch {
      addToast({ color: 'danger', title: t('common.error') })
    } finally {
      stopLoading()
    }
  }, [
    isLoading,
    user.platform,
    authData,
    localAccount,
    accounts,
    paths.launcher,
    setAccounts,
    setLocalAccount,
    t,
    startLoading,
    stopLoading
  ])

  const handleSkinScreenshot = useCallback((dataUrl: string) => {
    setCroppedImage(dataUrl)
    setIsCropping(true)
    setSkinModal(false)
  }, [])

  return (
    <>
      <Modal
        isOpen
        size={isOwner ? '2xl' : 'lg'}
        onClose={() => {
          if (isLoading) return
          onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('accountInfo.title')}</ModalHeader>

          <ModalBody>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 justify-between">
                <div className="flex items-center gap-2">
                  <span className={isOwner ? 'cursor-pointer' : ''} onClick={handleChooseAvatar}>
                    <Tooltip content={t('accountInfo.changeAvatar')} isDisabled={!isOwner}>
                      <Avatar src={image ?? ''} name={user.nickname} size="lg" />
                    </Tooltip>
                  </span>

                  <div className="flex flex-col">
                    <p className="text-xl font-semibold">{user.nickname}</p>
                    <p className="text-xs text-gray-400">{user.platform}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {user.achievements.length > 0 && (
                    <div className="overflow-hidden max-w-96" ref={emblaRef}>
                      <div className="flex">
                        {user.achievements.map((achievement, i) => {
                          const src = ACH_ICON[achievement] ?? ''
                          if (!src) return null

                          return (
                            <div
                              className="flex-shrink-0 px-2 select-none"
                              key={`${achievement}-${i}`}
                            >
                              <Tooltip delay={500} content={t(`achievements.${achievement}`)}>
                                <img
                                  width={64}
                                  draggable={false}
                                  src={src}
                                  alt={t(`achievements.${achievement}`)}
                                />
                              </Tooltip>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {isOwner && (
                    <Button
                      color="secondary"
                      isDisabled={isLoading}
                      onPress={() => setIsAchievements(true)}
                      isIconOnly
                      variant="flat"
                    >
                      <Award size={22} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col">
                <div className="flex gap-2 items-center">
                  <p>{t('accountInfo.registered')}:</p>
                  <p>{formatDate(new Date(user.createdAt))}</p>
                </div>

                <div className="flex gap-2 items-center">
                  <p>{t('accountInfo.friends')}:</p>
                  <p>{user.friends.length}</p>
                </div>

                <div className="flex gap-2 items-center">
                  <p>{t('accountInfo.playTime')}:</p>
                  <p>
                    {formatTime(user.playTime, {
                      h: t('time.h'),
                      m: t('time.m'),
                      s: t('time.s')
                    })}
                  </p>
                </div>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            {isOwner && (
              <Button
                variant="flat"
                isDisabled={!canSave}
                isLoading={isLoading && loadingType === 'save'}
                startContent={<Save className="flex-shrink-0" size={22} />}
                color="success"
                onPress={handleSaveAvatar}
              >
                {t('common.save')}
              </Button>
            )}

            <Button
              variant="flat"
              startContent={<Shirt className="flex-shrink-0" size={22} />}
              isDisabled={isLoading}
              isLoading={isLoading && loadingType === 'skin'}
              onPress={handleOpenSkin}
            >
              {t('skinView.title')}
            </Button>

            {isOwner && (
              <Button
                isDisabled={isLoading}
                variant="flat"
                isLoading={isLoading && loadingType === 'manageSkins'}
                startContent={<Settings2 className="flex-shrink-0" size={22} />}
                onPress={handleManageSkins}
              >
                {t('manageSkins.title')}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isManageSkins && <ManageSkins onClose={() => setIsManageSkins(false)} />}

      {skinModal && (
        <SkinView
          skinData={skinData}
          nickname={user.nickname}
          isOwner={isOwnerLocal}
          onClose={() => setSkinModal(false)}
          setScreenshotFile={handleSkinScreenshot}
        />
      )}

      {isCropping && (
        <ImageCropper
          onClose={() => setIsCropping(false)}
          title={t('accountInfo.editingAvatar')}
          image={croppedImage}
          size={{ width: 128, height: 128 }}
          changeImage={setImage}
        />
      )}

      {isAchievements && isOwner && (
        <Achievements onClose={() => setIsAchievements(false)} user={user} />
      )}
    </>
  )
}
