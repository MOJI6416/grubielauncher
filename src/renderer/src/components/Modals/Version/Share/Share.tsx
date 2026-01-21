import {
  addToast,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Textarea,
  Tooltip
} from '@heroui/react'
import { ILoader } from '@/types/Loader'
import { SelectPaths } from '@renderer/components/Modals/Version/Share/SelectPaths'
import { IModpack, IModpackUpdate } from '@/types/Backend'
import { modpackTags } from '@/types/Browser'
import {
  accountAtom,
  authDataAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  versionsAtom,
  versionServersAtom
} from '@renderer/stores/atoms'
import { useAtom } from 'jotai'
import { ArrowUpFromLine, FolderOpen, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '@renderer/utilities/file'

const api = window.api

export function Share({
  closeModal,
  modpack,
  shareType,
  diffenceUpdateData,
  successUpdate
}: {
  closeModal: () => void
  modpack?: IModpack
  shareType: 'new' | 'update'
  diffenceUpdateData: string
  successUpdate: () => void
}) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'share' | 'delete' | 'size'>()
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom)
  const [isShareName, setIsShareName] = useState(false)
  const [isShareImage, setIsShareImage] = useState(false)
  const [isShareMods, setIsShareMods] = useState(false)
  const [isShareServers, setIsShareServers] = useState(false)
  const [isShareOptions, setIsShareOptions] = useState(false)
  const [isShareArguments, setIsShareArguments] = useState(false)
  const [isShareOtherFiles, setIsShareOtherFiles] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [paths, setPaths] = useState<string[]>([])
  const [isOpenSelectPaths, setIsOpenSelectPaths] = useState(false)

  const [selectPathsFolder, setSelectPathsFolder] = useState<string>('')

  const [totalSize, setTotalSize] = useState(0)
  const [isExistsOptionsFile] = useState(false)
  const [isNetwork] = useAtom(networkAtom)
  const [servers] = useAtom(versionServersAtom)
  const [account] = useAtom(accountAtom)
  const [globalPaths] = useAtom(pathsAtom)
  const [versions, setVersions] = useAtom(versionsAtom)
  const [build] = useState(0)
  const [authData] = useAtom(authDataAtom)

  useEffect(() => {
    ;(async () => {
      if (modpack) {
        setIsPublic(modpack.public)
        setDescription(modpack.description)
        setTags(modpack.tags)
      }
    })()
  }, [])

  useEffect(() => {
    const fetchTotalSizes = async () => {
      if (selectedVersion) {
        setIsLoading(true)
        setLoadingType('size')

        const versionPath = selectedVersion.versionPath

        const fullPathsPromises = paths.map((p) => api.path.join(versionPath, p))
        const fullPaths = await Promise.all(fullPathsPromises)

        const sizes = await api.file.getTotalSizes(fullPaths)

        setTotalSize(sizes)
        setIsLoading(false)
        setLoadingType(undefined)
      }
    }

    fetchTotalSizes()
  }, [paths, isShareOtherFiles])

  async function updateShare(silentMode = false, shareCode: string) {
    if (!selectedVersion || !account || !authData) return

    const versionPath = selectedVersion.versionPath

    if (!silentMode) {
      setIsLoading(true)
      setLoadingType('share')
    }

    let mods = [...selectedVersion.version.loader.mods]

    try {
      let options = ''
      if (isShareOptions) {
        const optionsPath = await api.path.join(versionPath, 'options.txt')

        try {
          options = await api.fs.readFile(optionsPath, 'utf-8')
        } catch {}
      }

      let isUpdateVersion = false

      if (isShareMods) {
        const result = await api.version.share.uploadMods(account.accessToken!, {
          ...selectedVersion.version,
          shareCode
        })
        if (result.success) mods = result.mods
      }

      let other: ILoader['other'] | null = null
      const index = versions.findIndex((v) => v.version.name == selectedVersion?.version.name)

      if (isShareOtherFiles && paths) {
        const validPathsPromises = paths.map((p) => api.path.join(versionPath, p))
        const validPaths = await Promise.all(validPathsPromises)

        const tempPath = await api.path.join(versionPath, 'temp')
        const zipPath = await api.path.join(tempPath, 'other.zip')

        const computedTotalSize = await api.file.getTotalSizes(validPaths)
        if (computedTotalSize > 1_000_000_000) {
          throw Error('not uploaded')
        }

        await api.file.archiveFiles(validPaths, zipPath)

        const url = await api.backend.uploadFileFromPath(
          account.accessToken!,
          zipPath,
          undefined,
          `modpacks/${shareCode}`
        )

        await api.fs.rimraf(tempPath)

        if (!url) throw Error('not uploaded')

        const data = {
          paths,
          url,
          size: computedTotalSize
        }

        other = data
        versions[index].version.loader.other = data

        isUpdateVersion = true
      }

      let updateImage = selectedVersion.version.image
      if ((isShareImage || silentMode) && selectedVersion.version.image) {
        const response = await fetch(selectedVersion.version.image)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const buffer = new Uint8Array(arrayBuffer)
        const tmpPath = await api.path.join(await api.other.getPath('temp'), 'logo.png')

        await api.fs.writeFile(tmpPath, buffer)

        const upload = await api.backend.uploadFileFromPath(
          account.accessToken!,
          tmpPath,
          undefined,
          `modpacks/${shareCode}`
        )

        await api.fs.rimraf(tmpPath)

        if (upload) {
          selectedVersion.version.image = upload
          updateImage = upload

          isUpdateVersion = true
        }
      }

      if (isUpdateVersion) {
        await selectedVersion.save()
        setSelectedVersion(selectedVersion)
      }

      const update: IModpackUpdate = {
        build,
        name: isShareName ? selectedVersion.version.name : null,
        mods: isShareMods ? mods : null,
        servers: isShareServers ? servers : null,
        options: isShareOptions ? options : null,
        runArguments:
          isShareArguments && selectedVersion?.version.runArguments
            ? selectedVersion?.version.runArguments
            : null,
        other: isShareOtherFiles ? other : null,
        public: isPublic,
        image: isShareImage || silentMode ? updateImage : null,
        description: modpack?.description != description ? description : null,
        tags: modpack?.tags != tags ? tags : null,
        quickServer: isShareServers ? selectedVersion.version.quickServer || '' : null
      }

      const isUpdated = await api.backend.updateModpack(account.accessToken!, shareCode, update)
      if (!isUpdated) throw Error('not updated')

      if (!silentMode) {
        successUpdate()
        addToast({
          title: t('versions.published'),
          color: 'success'
        })
      }
    } catch (err) {
      if (!silentMode) {
        addToast({
          title: t('versions.publishError'),
          color: 'danger'
        })
      }
    } finally {
      setIsLoading(false)
      setLoadingType(undefined)
    }
  }

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          if (isLoading) return
          closeModal()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('versions.shareOptions')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-2">
              {shareType == 'update' && (
                <>
                  <Checkbox
                    isDisabled={!diffenceUpdateData.includes('name') || isLoading}
                    isSelected={isShareName}
                    onChange={() => setIsShareName((prev) => !prev)}
                  >
                    {t('versions.updateName')}
                  </Checkbox>
                  <Checkbox
                    isDisabled={!diffenceUpdateData.includes('logo') || isLoading}
                    isSelected={isShareImage}
                    onChange={() => setIsShareImage((prev) => !prev)}
                  >
                    {t('versions.updateLogo')}
                  </Checkbox>
                </>
              )}
              <Checkbox
                isDisabled={
                  (shareType == 'new'
                    ? selectedVersion?.version.loader.mods.length == 0
                    : !diffenceUpdateData.includes('mods')) || isLoading
                }
                isSelected={isShareMods}
                onChange={() => setIsShareMods((prev) => !prev)}
              >
                {shareType == 'new' ? t('versions.shareMods') : t('versions.updateMods')}
              </Checkbox>
              <Checkbox
                isDisabled={
                  (shareType == 'new'
                    ? servers.length == 0
                    : !diffenceUpdateData.includes('servers')) || isLoading
                }
                isSelected={isShareServers}
                onChange={() => setIsShareServers((prev) => !prev)}
              >
                {shareType == 'new' ? t('versions.shareServers') : t('versions.updateServers')}
              </Checkbox>
              <Checkbox
                isDisabled={
                  (shareType == 'new'
                    ? !isExistsOptionsFile
                    : !diffenceUpdateData.includes('options')) || isLoading
                }
                isSelected={isShareOptions}
                onChange={() => setIsShareOptions((prev) => !prev)}
              >
                {shareType == 'new'
                  ? t('versions.shareGameSettings')
                  : t('versions.updateGameSettings')}
              </Checkbox>
              <Checkbox
                isDisabled={
                  (shareType == 'new'
                    ? selectedVersion?.version.runArguments?.jvm == '' &&
                      selectedVersion?.version.runArguments?.game == ''
                    : !diffenceUpdateData.includes('arguments')) || isLoading
                }
                isSelected={isShareArguments}
                onChange={() => setIsShareArguments((prev) => !prev)}
              >
                {shareType == 'new' ? t('versions.shareArguments') : t('versions.updateArguments')}
              </Checkbox>
              <div className="flex items-center gap-2">
                <Checkbox
                  isDisabled={
                    (shareType == 'update' && !diffenceUpdateData.includes('other')) || isLoading
                  }
                  isSelected={isShareOtherFiles}
                  onChange={() => {
                    setIsShareOtherFiles((prev) => !prev)
                    setPaths(selectedVersion?.version.loader.other?.paths || [])
                  }}
                >
                  {shareType == 'new'
                    ? t('versions.shareOtherFiles')
                    : t('versions.updateOtherFiles')}
                </Checkbox>
                <Tooltip content={t('share.limitExceeded')} isDisabled={totalSize <= 1_000_000_000}>
                  <div className="flex items-center space-x-1">
                    <Button
                      color={totalSize > 1_000_000_000 ? 'warning' : 'default'}
                      isLoading={isLoading && loadingType == 'size'}
                      variant="flat"
                      isIconOnly
                      size="sm"
                      isDisabled={isLoading || !isShareOtherFiles}
                      onPress={async () => {
                        if (selectedVersion) {
                          const folder = await api.path.join(
                            globalPaths.minecraft,
                            'versions',
                            selectedVersion.version.name
                          )
                          setSelectPathsFolder(folder)
                          setIsOpenSelectPaths(true)
                        }
                      }}
                    >
                      <FolderOpen size={22} />
                    </Button>
                    {totalSize > 0 && isShareOtherFiles && (
                      <p
                        className={`text-xs ${totalSize > 1_000_000_000 ? 'text-warning-400' : 'text-gray-400'}`}
                      >
                        {formatBytes(totalSize, [
                          t('share.sizes.0'),
                          t('share.sizes.1'),
                          t('share.sizes.2'),
                          t('share.sizes.3'),
                          t('share.sizes.4')
                        ])}
                      </p>
                    )}
                  </div>
                </Tooltip>
              </div>

              <div className="flex flex-col gap-2">
                <Checkbox
                  isDisabled={isLoading}
                  isSelected={isPublic}
                  onChange={() => setIsPublic((prev) => !prev)}
                >
                  {t('versions.publicModpack')}
                </Checkbox>
              </div>
              {isPublic && (
                <div className="flex flex-col gap-2">
                  <Textarea
                    label={t('common.description')}
                    endContent={<p className="text-xs">{description.length}/256</p>}
                    value={description}
                    isDisabled={isLoading}
                    onChange={(e) => {
                      setDescription(e.target.value)
                    }}
                    maxRows={5}
                    minRows={3}
                  />

                  <Select
                    label={t('browser.tagsTitle')}
                    placeholder={t('versions.selectTags')}
                    isDisabled={isLoading}
                    selectionMode="multiple"
                    selectedKeys={tags}
                    onChange={(event) => {
                      const values = event.target.value.split(',')
                      setTags(values.sort((a, b) => a.localeCompare(b)))
                    }}
                  >
                    {modpackTags.map((tag) => {
                      return <SelectItem key={tag}>{t('browser.modpackTags.' + tag)}</SelectItem>
                    })}
                  </Select>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex items-center gap-2">
              <Button
                color="primary"
                variant="flat"
                startContent={<ArrowUpFromLine size={22} />}
                isDisabled={
                  (shareType == 'update' &&
                    !isShareName &&
                    !isShareMods &&
                    !isShareOptions &&
                    !isShareServers &&
                    !isShareImage &&
                    !isShareArguments &&
                    modpack?.description == description &&
                    modpack.tags == tags &&
                    (modpack ? modpack.public == isPublic : true) &&
                    (selectedVersion &&
                    modpack &&
                    modpack.conf.loader.other &&
                    isShareOtherFiles &&
                    totalSize
                      ? totalSize === modpack.conf.loader.other.size
                      : true)) ||
                  !isNetwork ||
                  description.length > 256 ||
                  totalSize > 1_000_000_000
                }
                isLoading={isLoading && loadingType == 'share'}
                onPress={async () => {
                  if (!selectedVersion || !account || !authData) return

                  if (shareType == 'update' && selectedVersion.version.shareCode) {
                    await updateShare(false, selectedVersion.version.shareCode)

                    closeModal()
                    return
                  }

                  try {
                    setLoadingType('share')
                    setIsLoading(true)

                    const shareCode = await api.backend.shareModpack(account.accessToken!, {
                      conf: {
                        ...selectedVersion.version,
                        loader: {
                          ...selectedVersion.version.loader,
                          mods: []
                        },
                        servers: [],
                        options: '',
                        runArguments: {
                          game: '',
                          jvm: ''
                        },
                        image: selectedVersion.version.image || '',
                        quickServer: ''
                      }
                    })

                    if (!shareCode) throw Error('not share code')

                    await updateShare(true, shareCode)

                    if (selectedVersion) {
                      const index = versions.findIndex(
                        (v) => v.version.name == selectedVersion.version.name
                      )

                      selectedVersion.version.shareCode = shareCode
                      versions[index].version.shareCode = shareCode

                      setVersions(versions)

                      await selectedVersion.save()

                      await api.clipboard.writeText(shareCode)

                      successUpdate()
                      addToast({
                        title: t('versions.published'),
                        color: 'success'
                      })
                    }
                  } catch (error) {
                    addToast({
                      title: t('versions.publishError'),
                      color: 'danger'
                    })
                  } finally {
                    setIsLoading(false)
                    setLoadingType(undefined)
                    closeModal()
                  }
                }}
              >
                {shareType == 'new' ? t('versions.share') : t('common.update')}
              </Button>
              {shareType == 'update' && (
                <Button
                  color="danger"
                  variant="flat"
                  isLoading={isLoading && loadingType == 'delete'}
                  onPress={async () => {
                    if (
                      !selectedVersion ||
                      !account ||
                      !selectedVersion.version.shareCode ||
                      !authData
                    )
                      return
                    setIsLoading(true)
                    setLoadingType('delete')

                    await api.backend.deleteModpack(
                      account.accessToken!,
                      selectedVersion.version.shareCode
                    )

                    selectedVersion.version.shareCode = ''
                    selectedVersion.version.image = ''
                    await selectedVersion.save()

                    setIsLoading(false)
                    setLoadingType(undefined)

                    closeModal()
                    addToast({
                      title: t('share.deleted'),
                      color: 'success'
                    })
                  }}
                  startContent={<Trash size={22} />}
                >
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {isOpenSelectPaths && selectedVersion && (
        <SelectPaths
          loader={selectedVersion.version.loader.name}
          version={selectedVersion.version.version.id}
          onClose={() => {
            setIsOpenSelectPaths(false)
          }}
          passPaths={(paths: string[]) => {
            setPaths(paths)
          }}
          pathFolder={selectPathsFolder}
          selectedPaths={paths}
        />
      )}
    </>
  )
}
