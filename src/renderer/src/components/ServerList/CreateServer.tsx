import { IServer } from '@/types/ServersList'
import {
  addToast,
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem
} from '@heroui/react'
import { selectedVersionAtom } from '@renderer/stores/atoms'
import { useAtom } from 'jotai'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function CreateServer({
  onClose,
  servers,
  setServers,
  setQuickConnectIp
}: {
  onClose: () => void
  servers: IServer[]
  setServers: React.Dispatch<React.SetStateAction<IServer[]>>
  setQuickConnectIp: (ip: string) => void
}) {
  const [serverName, setServerName] = useState('')
  const [serverAddress, setServerAddress] = useState('')
  const [acceptTextures, setAcceptTextures] = useState<number | null>(null)
  const [isQuickConnect, setIsQuickConnect] = useState(false)
  const [selectedVersion] = useAtom(selectedVersionAtom)

  const { t } = useTranslation()

  const normalizedName = useMemo(() => serverName.trim(), [serverName])
  const normalizedAddress = useMemo(() => serverAddress.trim(), [serverAddress])

  const normalizedAddressKey = useMemo(() => {
    return normalizedAddress.toLowerCase()
  }, [normalizedAddress])

  const isAddressValid = useMemo(() => {
    if (!normalizedAddress) return false
    if (normalizedAddress.includes(' ')) return false
    return true
  }, [normalizedAddress])

  const isDuplicate = useMemo(() => {
    const nameKey = normalizedName.toLowerCase()
    return servers.some(
      (s) =>
        s.name.trim().toLowerCase() === nameKey ||
        s.ip.trim().toLowerCase() === normalizedAddressKey
    )
  }, [servers, normalizedName, normalizedAddressKey])

  return (
    <Modal isOpen onClose={onClose}>
      <ModalContent>
        <ModalHeader>{t('servers.adding')}</ModalHeader>
        <ModalBody>
          <div className="flex flex-col space-y-2">
            <Input
              label={t('servers.name')}
              value={serverName}
              onChange={(e) => setServerName(e.currentTarget.value)}
            />

            <Input
              label={t('servers.address')}
              value={serverAddress}
              onChange={(e) => setServerAddress(e.currentTarget.value)}
            />

            <div className="flex flex-col gap-1">
              <Select
                label={t('servers.resources')}
                selectedKeys={new Set([acceptTextures === null ? 'null' : String(acceptTextures)])}
                onChange={(event) => {
                  const { value } = event.target
                  if (!value) return
                  setAcceptTextures(value === 'null' ? null : Number(value))
                }}
              >
                <SelectItem key={'null'}>{t('servers.resourceSets.0')}</SelectItem>
                <SelectItem key={'1'}>{t('servers.resourceSets.1')}</SelectItem>
                <SelectItem key={'0'}>{t('servers.resourceSets.2')}</SelectItem>
              </Select>

              {selectedVersion?.isQuickPlayMultiplayer && (
                <Checkbox
                  onChange={() => setIsQuickConnect((prev) => !prev)}
                  isSelected={isQuickConnect}
                >
                  {t('servers.quickConnect')}
                </Checkbox>
              )}
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            color="success"
            variant="flat"
            isDisabled={
              normalizedName === '' || normalizedAddress === '' || !isAddressValid || isDuplicate
            }
            onPress={() => {
              if (isDuplicate) {
                addToast({ title: t('servers.already'), color: 'warning' })
                return
              }

              const newServer: IServer = {
                name: normalizedName,
                ip: normalizedAddress,
                acceptTextures
              }

              setServers((prev) => [...prev, newServer])

              if (isQuickConnect) {
                setQuickConnectIp(newServer.ip)
              }

              addToast({ title: t('servers.added'), color: 'success' })
              onClose()
            }}
            startContent={<Plus size={22} />}
          >
            {t('servers.add')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
