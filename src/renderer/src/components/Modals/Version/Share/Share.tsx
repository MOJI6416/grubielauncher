import {
  addToast,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip
} from '@heroui/react'
import { ILoader } from '@/types/Loader'
import { SelectPaths } from '@renderer/components/Modals/Version/Share/SelectPaths'
import { IModpack, IModpackUpdate } from '@/types/Backend'
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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatBytes } from '@renderer/utilities/file'

const api = window.api

const MAX_OTHER_BYTES = 1_000_000_000

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

  const [paths, setPaths] = useState<string[]>([])
  const [isOpenSelectPaths, setIsOpenSelectPaths] = useState(false)

  const [selectPathsFolder, setSelectPathsFolder] = useState<string>('')

  const [totalSize, setTotalSize] = useState(0)
  const [isExistsOptionsFile, setIsExistsOptionsFile] = useState(false)

  const [isNetwork] = useAtom(networkAtom)
  const [servers] = useAtom(versionServersAtom)
  const [account] = useAtom(accountAtom)
  const [globalPaths] = useAtom(pathsAtom)
  const [versions, setVersions] = useAtom(versionsAtom)
  const [build] = useState(0)
  const [authData] = useAtom(authDataAtom)

  useEffect(() => {
    let cancelled = false

    const checkOptionsFile = async () => {
      if (!selectedVersion) {
        setIsExistsOptionsFile(false)
        return
      }

      try {
        const optionsPath = await api.path.join(selectedVersion.versionPath, 'options.txt')
        const exists = await api.fs.pathExists(optionsPath)
        if (!cancelled) setIsExistsOptionsFile(!!exists)
      } catch {
        if (!cancelled) setIsExistsOptionsFile(false)
      }
    }

    checkOptionsFile()
    return () => {
      cancelled = true
    }
  }, [selectedVersion])

  useEffect(() => {
    let cancelled = false

    const fetchTotalSizes = async () => {
      if (!selectedVersion || !isShareOtherFiles || paths.length === 0) {
        setTotalSize(0)
        return
      }

      setIsLoading(true)
      setLoadingType('size')

      try {
        const versionPath = selectedVersion.versionPath
        const fullPaths = await Promise.all(paths.map((p) => api.path.join(versionPath, p)))
        const sizes = await api.file.getTotalSizes(fullPaths)
        if (!cancelled) setTotalSize(sizes)
      } catch {
        if (!cancelled) setTotalSize(0)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setLoadingType(undefined)
        }
      }
    }

    fetchTotalSizes()
    return () => {
      cancelled = true
    }
  }, [paths, isShareOtherFiles, selectedVersion])

  const hasAnyUpdateChanges = useMemo(() => {
    if (shareType !== 'update' || !modpack || !selectedVersion) return true

    const anyShareFlags =
      isShareName ||
      isShareMods ||
      isShareOptions ||
      isShareServers ||
      isShareImage ||
      isShareArguments ||
      isShareOtherFiles

    const otherSizeSame =
      modpack.conf.loader?.other && isShareOtherFiles
        ? totalSize === modpack.conf.loader.other.size
        : true

    return anyShareFlags || !otherSizeSame
  }, [
    shareType,
    modpack,
    selectedVersion,
    isShareName,
    isShareMods,
    isShareOptions,
    isShareServers,
    isShareImage,
    isShareArguments,
    isShareOtherFiles,
    totalSize
  ])

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

      let isUpdateVersionLocal = false

      if (isShareMods) {
        const result = await api.version.share.uploadMods(account.accessToken!, {
          ...selectedVersion.version,
          shareCode
        })
        if (result.success) mods = result.mods
      }

      let other: ILoader['other'] | null = null
      const versionIndex = versions.findIndex(
        (v) => v.version.name === selectedVersion.version.name
      )

      if (isShareOtherFiles && paths.length > 0) {
        const validPaths = await Promise.all(paths.map((p) => api.path.join(versionPath, p)))

        const computedTotalSize = await api.file.getTotalSizes(validPaths)
        if (computedTotalSize > MAX_OTHER_BYTES) {
          throw new Error('limit exceeded')
        }

        const tmpZipPath = await api.path.join(
          await api.other.getPath('temp'),
          `other_${shareCode}.zip`
        )

        await api.file.archiveFiles(validPaths, tmpZipPath)

        const url = await api.backend.uploadFileFromPath(
          account.accessToken!,
          tmpZipPath,
          undefined,
          `modpacks/${shareCode}`
        )

        await api.fs.rimraf(tmpZipPath)

        if (!url) throw new Error('not uploaded')

        other = { paths, url, size: computedTotalSize }

        if (versionIndex !== -1) {
          versions[versionIndex].version.loader.other = other
          setVersions([...versions])
        }

        selectedVersion.version.loader.other = other
        isUpdateVersionLocal = true
      }

      let updateImage = selectedVersion.version.image
      if ((isShareImage || silentMode) && selectedVersion.version.image) {
        const response = await fetch(selectedVersion.version.image)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const buffer = new Uint8Array(arrayBuffer)
        const tmpPath = await api.path.join(
          await api.other.getPath('temp'),
          `logo_${shareCode}.png`
        )

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
          isUpdateVersionLocal = true
        }
      }

      if (isUpdateVersionLocal) {
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
          isShareArguments && selectedVersion.version.runArguments
            ? selectedVersion.version.runArguments
            : null,
        other: isShareOtherFiles ? other : null,
        image: isShareImage || silentMode ? updateImage : null,
        quickServer: isShareServers ? selectedVersion.version.quickServer || '' : null
      }

      const isUpdated = await api.backend.updateModpack(account.accessToken!, shareCode, update)
      if (!isUpdated) throw new Error('not updated')

      if (!silentMode) {
        successUpdate()
        addToast({
          title: t('versions.published'),
          color: 'success'
        })
      }
    } catch {
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
              {shareType === 'update' && (
                <>
                  <Checkbox
                    isDisabled={!diffenceUpdateData.includes('name') || isLoading}
                    isSelected={isShareName}
                    onValueChange={(v) => setIsShareName(v)}
                  >
                    {t('versions.updateName')}
                  </Checkbox>
                  <Checkbox
                    isDisabled={!diffenceUpdateData.includes('logo') || isLoading}
                    isSelected={isShareImage}
                    onValueChange={(v) => setIsShareImage(v)}
                  >
                    {t('versions.updateLogo')}
                  </Checkbox>
                </>
              )}

              <Checkbox
                isDisabled={
                  (shareType === 'new'
                    ? (selectedVersion?.version.loader.mods.length ?? 0) === 0
                    : !diffenceUpdateData.includes('mods')) || isLoading
                }
                isSelected={isShareMods}
                onValueChange={(v) => setIsShareMods(v)}
              >
                {shareType === 'new' ? t('versions.shareMods') : t('versions.updateMods')}
              </Checkbox>

              <Checkbox
                isDisabled={
                  (shareType === 'new'
                    ? servers.length === 0
                    : !diffenceUpdateData.includes('servers')) || isLoading
                }
                isSelected={isShareServers}
                onValueChange={(v) => setIsShareServers(v)}
              >
                {shareType === 'new' ? t('versions.shareServers') : t('versions.updateServers')}
              </Checkbox>

              <Checkbox
                isDisabled={
                  (shareType === 'new'
                    ? !isExistsOptionsFile
                    : !diffenceUpdateData.includes('options')) || isLoading
                }
                isSelected={isShareOptions}
                onValueChange={(v) => setIsShareOptions(v)}
              >
                {shareType === 'new'
                  ? t('versions.shareGameSettings')
                  : t('versions.updateGameSettings')}
              </Checkbox>

              <Checkbox
                isDisabled={
                  (shareType === 'new'
                    ? !selectedVersion?.version.runArguments?.jvm &&
                      !selectedVersion?.version.runArguments?.game
                    : !diffenceUpdateData.includes('arguments')) || isLoading
                }
                isSelected={isShareArguments}
                onValueChange={(v) => setIsShareArguments(v)}
              >
                {shareType === 'new' ? t('versions.shareArguments') : t('versions.updateArguments')}
              </Checkbox>

              <div className="flex items-center gap-2">
                <Checkbox
                  isDisabled={
                    (shareType === 'update' && !diffenceUpdateData.includes('other')) || isLoading
                  }
                  isSelected={isShareOtherFiles}
                  onValueChange={(v) => {
                    setIsShareOtherFiles(v)
                    if (v) setPaths(selectedVersion?.version.loader.other?.paths || [])
                  }}
                >
                  {shareType === 'new'
                    ? t('versions.shareOtherFiles')
                    : t('versions.updateOtherFiles')}
                </Checkbox>

                <Tooltip
                  content={t('share.limitExceeded')}
                  isDisabled={totalSize <= MAX_OTHER_BYTES}
                >
                  <div className="flex items-center space-x-1">
                    <Button
                      color={totalSize > MAX_OTHER_BYTES ? 'warning' : 'default'}
                      isLoading={isLoading && loadingType === 'size'}
                      variant="flat"
                      isIconOnly
                      size="sm"
                      isDisabled={isLoading || !isShareOtherFiles}
                      onPress={async () => {
                        if (!selectedVersion) return
                        setSelectPathsFolder(selectedVersion.versionPath)
                        setIsOpenSelectPaths(true)
                      }}
                    >
                      <FolderOpen size={22} />
                    </Button>

                    {totalSize > 0 && isShareOtherFiles && (
                      <p
                        className={`text-xs ${
                          totalSize > MAX_OTHER_BYTES ? 'text-warning-400' : 'text-gray-400'
                        }`}
                      >
                        {formatBytes(totalSize, [
                          t('sizes.0'),
                          t('sizes.1'),
                          t('sizes.2'),
                          t('sizes.3'),
                          t('sizes.4')
                        ])}
                      </p>
                    )}
                  </div>
                </Tooltip>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <div className="flex items-center gap-2">
              <Button
                color="primary"
                variant="flat"
                startContent={<ArrowUpFromLine size={22} />}
                isDisabled={
                  isLoading ||
                  !isNetwork ||
                  totalSize > MAX_OTHER_BYTES ||
                  (shareType === 'update' ? !hasAnyUpdateChanges : false)
                }
                isLoading={isLoading && loadingType === 'share'}
                onPress={async () => {
                  if (!selectedVersion || !account || !authData) return

                  if (shareType === 'update' && selectedVersion.version.shareCode) {
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

                    if (!shareCode) throw new Error('not share code')

                    await updateShare(true, shareCode)

                    const index = versions.findIndex(
                      (v) => v.version.name === selectedVersion.version.name
                    )
                    selectedVersion.version.shareCode = shareCode
                    if (index !== -1) {
                      versions[index].version.shareCode = shareCode
                      setVersions([...versions])
                    }

                    await selectedVersion.save()
                    await api.clipboard.writeText(shareCode)

                    successUpdate()
                    addToast({
                      title: t('versions.published'),
                      color: 'success'
                    })
                  } catch {
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
                {shareType === 'new' ? t('versions.share') : t('common.update')}
              </Button>

              {shareType === 'update' && (
                <Button
                  color="danger"
                  variant="flat"
                  isDisabled={isLoading}
                  isLoading={isLoading && loadingType === 'delete'}
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

                    const shareCode = selectedVersion.version.shareCode
                    selectedVersion.version.shareCode = ''
                    selectedVersion.version.image = ''
                    await selectedVersion.save()

                    const index = versions.findIndex(
                      (v) => v.version.name === selectedVersion.version.name
                    )
                    if (index !== -1 && versions[index].version.shareCode === shareCode) {
                      versions[index].version.shareCode = ''
                      setVersions([...versions])
                    }

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
          onClose={() => setIsOpenSelectPaths(false)}
          passPaths={(p: string[]) => setPaths(p)}
          pathFolder={
            selectPathsFolder ||
            (globalPaths?.minecraft ? globalPaths.minecraft : selectedVersion.versionPath)
          }
          selectedPaths={paths}
        />
      )}
    </>
  )
}
