const api = window.api
const fs = api.fs
const path = api.path

import { IUser } from '@/types/IUser'
import { useTranslation } from 'react-i18next'
import { Award, Save, Settings2, Shirt } from 'lucide-react'
import { SkinView } from '../SkinView'
import { ImageCropper } from '../ImageCropper'
import { useState } from 'react'
import { useAtom } from 'jotai'
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  backendServiceAtom,
  pathsAtom
} from '@renderer/stores/Main'
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
import { IAccountConf, IAuth } from '@/types/Account'
import { ISkinData } from '@/types/Skin'
import { SkinsManager } from '@renderer/utilities/SkinsManager'
import { formatDate, formatTime } from '@renderer/utilities/Other'
import { getSkin } from '@renderer/utilities/Skin'
import { authMicrosoft } from '@renderer/services/Auth'
import { jwtDecode } from 'jwt-decode'
import pt100 from '@renderer/assets/achievements/pt100.png'
import pt500 from '@renderer/assets/achievements/pt500.png'
import pt1000 from '@renderer/assets/achievements/pt1000.png'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Achievements } from './Achievements'

type LoadingType = 'skin' | 'save' | 'manageSkins'

export default function AccountInfo({
  onClose,
  user,
  isOwner
}: {
  onClose: () => void
  user: IUser
  isOwner: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<LoadingType | undefined>()
  const [skinData, setSkinData] = useState<ISkinData>({
    skin: 'steve'
  })
  const [skinModal, setSkinModal] = useState(false)
  const [croppedImage, setCroppedImage] = useState<string>('')
  const [isCropping, setIsCropping] = useState(false)
  const [image, setImage] = useState<string | null>(user.image)
  const [file, setFile] = useState<File | null>(null)
  const [localAccount, setLocalAccount] = useAtom(accountAtom)
  const [accounts, setAccounts] = useAtom(accountsAtom)
  const [paths] = useAtom(pathsAtom)
  const [isManageSkins, setIsManageSkins] = useState(false)
  const [skinsManger, setSkinsManager] = useState<SkinsManager>()
  const [authData] = useAtom(authDataAtom)
  const [backendService] = useAtom(backendServiceAtom)
  const [isAchievements, setIsAchievements] = useState(false)

  const [emblaRef] = useEmblaCarousel({ loop: false, dragFree: true, align: 'start' }, [
    Autoplay({
      delay: 2500,
      stopOnInteraction: false,
      stopOnMouseEnter: true
    })
  ])

  const { t } = useTranslation()

  return (
    <>
      <Modal
        isOpen={true}
        size={`${isOwner ? '2xl' : 'lg'}`}
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
                  <span
                    className={`${isOwner ? 'cursor-pointer' : ''}`}
                    onClick={async () => {
                      if (!isOwner) return

                      const filePaths = await window.electron.ipcRenderer.invoke('openFileDialog')
                      if (!filePaths || filePaths.length == 0) return

                      setCroppedImage(filePaths[0])
                      setIsCropping(true)
                    }}
                  >
                    <Tooltip content={t('accountInfo.changeAvatar')} isDisabled={!isOwner}>
                      <Avatar src={`${image}` || ''} name={user.nickname} size="lg" />
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
                        {user.achievements.map((achievement, i) => (
                          <div className="flex-shrink-0 px-2 select-none" key={i}>
                            <Tooltip delay={500} content={t(`achievements.${achievement}`)}>
                              <img
                                width={64}
                                draggable={false}
                                src={
                                  achievement == 'pt100'
                                    ? pt100
                                    : achievement == 'pt500'
                                      ? pt500
                                      : achievement == 'pt1000'
                                        ? pt1000
                                        : ''
                                }
                                alt={t(`achievements.${achievement}`)}
                              />
                            </Tooltip>
                          </div>
                        ))}
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
                isDisabled={image == localAccount?.image}
                isLoading={isLoading && loadingType == 'save'}
                startContent={<Save className="flex-shrink-0" size={22} />}
                color="success"
                onPress={async () => {
                  try {
                    if (!image || !file || !localAccount) return

                    setIsLoading(true)
                    setLoadingType('save')

                    const url = await backendService.uploadFile(file, 'avatars')

                    if (!url) throw new Error('Error uploading')

                    setImage(url)

                    if (localAccount.accessToken)
                      await backendService.updateUser(user._id, { image: url })

                    const index = accounts.findIndex((a) => a.nickname == localAccount?.nickname)

                    accounts[index].image = url
                    localAccount.image = url

                    const accountsConf: IAccountConf = {
                      accounts,
                      lastPlayed: `${localAccount.type}_${localAccount.nickname}`
                    }

                    await fs.writeJSON(path.join(paths.launcher, 'accounts.json'), accountsConf, {
                      encoding: 'utf-8',
                      spaces: 2
                    })

                    if (setAccounts) setAccounts(accountsConf.accounts)
                    if (setLocalAccount) setLocalAccount(localAccount)

                    addToast({
                      color: 'success',
                      title: t('accountInfo.updated')
                    })
                  } catch (err) {
                    addToast({
                      color: 'danger',
                      title: t('common.error')
                    })
                  } finally {
                    setIsLoading(false)
                    setLoadingType(undefined)
                  }
                }}
              >
                {t('common.save')}
              </Button>
            )}
            <Button
              variant="flat"
              startContent={<Shirt className="flex-shrink-0" size={22} />}
              isDisabled={isLoading}
              isLoading={isLoading && loadingType == 'skin'}
              onPress={async () => {
                setIsLoading(true)
                setLoadingType('skin')

                const skinData = await getSkin(
                  user.platform,
                  user.uuid,
                  user.nickname,
                  localAccount?.accessToken
                )

                if (skinData) {
                  setSkinData(skinData)
                  setSkinModal(true)
                } else
                  addToast({
                    color: 'danger',
                    title: t('skinView.error')
                  })

                setIsLoading(false)
                setLoadingType(undefined)
              }}
            >
              {t('skinView.title')}
            </Button>
            {isOwner && (
              <Button
                isDisabled={isLoading}
                variant="flat"
                isLoading={isLoading && loadingType == 'manageSkins'}
                startContent={<Settings2 className="flex-shrink-0" size={22} />}
                onPress={async () => {
                  if (user.platform == 'elyby') {
                    api.shell.openExternal('https://ely.by/skins')

                    return
                  }

                  if (!authData || !localAccount || !localAccount.accessToken) return

                  setIsLoading(true)
                  setLoadingType('manageSkins')

                  let accessToken = authData.auth.accessToken
                  if (
                    user.platform == 'microsoft' &&
                    authData.auth.expiresAt &&
                    authData.auth.refreshToken
                  ) {
                    const { expiresAt } = authData.auth

                    if (Date.now() > expiresAt) {
                      const authUser = await authMicrosoft(
                        authData.auth.refreshToken,
                        true,
                        authData.sub,
                        localAccount.accessToken
                      )

                      if (!authUser) return

                      const newData = { ...localAccount, ...authUser }
                      const decoded = jwtDecode<IAuth>(authUser.accessToken)
                      accessToken = decoded.auth.accessToken

                      setLocalAccount(newData)
                      setAccounts((prev) => {
                        const index = prev.findIndex(
                          (a) => a.nickname == localAccount.nickname && a.type == localAccount.type
                        )
                        if (index == -1) return prev
                        prev[index] = newData
                        return prev
                      })

                      await fs.writeJSON(
                        path.join(paths.launcher, 'accounts.json'),
                        { accounts, lastPlayed: `${localAccount.type}_${authData.nickname}` },
                        {
                          encoding: 'utf-8',
                          spaces: 2
                        }
                      )
                    }
                  }

                  const skinsManager = new SkinsManager(
                    paths.launcher,
                    user.platform,
                    user.uuid,
                    user.nickname,
                    user.platform == 'microsoft' ? accessToken : localAccount.accessToken
                  )
                  await skinsManager.load()

                  setSkinsManager(skinsManager)
                  setIsManageSkins(true)

                  setIsLoading(false)
                  setLoadingType(undefined)
                }}
              >
                {t('manageSkins.title')}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {isManageSkins && skinsManger && (
        <ManageSkins skinsManager={skinsManger} onClose={() => setIsManageSkins(false)} />
      )}

      {skinModal && (
        <SkinView
          skinData={skinData}
          nickname={user.nickname}
          isOwner={localAccount?.nickname == user.nickname}
          onClose={() => {
            setSkinModal(false)
          }}
          setScreenshotFile={(data: string) => {
            const base64Data = data.split(';base64,').pop()
            if (!base64Data) return
            const binaryData = api.fromBuffer(base64Data, 'base64')
            const blob = new Blob([binaryData], { type: 'image/png' })
            const url = URL.createObjectURL(blob)

            setCroppedImage(url)
            setIsCropping(true)
            setSkinModal(false)
          }}
        />
      )}

      {isCropping && (
        <ImageCropper
          onClose={() => setIsCropping(false)}
          title={t('accountInfo.editingAvatar')}
          image={croppedImage}
          size={{ width: 128, height: 128 }}
          changeImage={async (url: string) => {
            const response = await fetch(url)
            const image = await response.blob()
            const file = new File([image], `${user._id}.png`, { type: `image/png` })

            setImage(url)
            setFile(file)
          }}
        />
      )}

      {isAchievements && isOwner && (
        <Achievements onClose={() => setIsAchievements(false)} user={user} />
      )}
    </>
  )
}
