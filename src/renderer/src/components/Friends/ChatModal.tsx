import { IModpack } from '@/types/Backend'
import { IFriend } from '@/types/IFriend'
import { IMessage } from '@/types/IMessage'
import {
  Alert,
  Avatar,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ScrollShadow,
  Spinner
} from '@heroui/react'
import { Gamepad2, Package, SendHorizontal } from 'lucide-react'
import { LoadingType } from './Friends'
import { Version } from '@renderer/classes/Version'
import { formatDate } from '@renderer/utilities/date'

interface ChatModalProps {
  friend: IFriend
  messages: IMessage[]
  messageText: string
  isLoading: boolean
  loadingType?: LoadingType
  loadingIndex: number
  chatModpacks: IModpack[]
  versions: Version[]
  shareableVersions: Version[]
  messagesRef: React.RefObject<HTMLDivElement | null>
  messageInputRef: React.RefObject<HTMLInputElement | null>
  account: any
  authData: any
  onClose: () => void
  onMessageChange: (text: string) => void
  onSendMessage: () => void
  onOpenVersionSelect: () => void
  onPlayModpack: (modpack: IModpack, version?: Version) => void
  t: any
}

export function ChatModal({
  friend,
  messages,
  messageText,
  isLoading,
  loadingType,
  loadingIndex,
  chatModpacks,
  versions,
  shareableVersions,
  messagesRef,
  messageInputRef,
  account,
  authData,
  onClose,
  onMessageChange,
  onSendMessage,
  onOpenVersionSelect,
  onPlayModpack,
  t
}: ChatModalProps) {
  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalContent>
        <ModalHeader>
          {t('friends.chatTitle')} {friend.user.nickname}
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4 justify-between">
            <Alert color="warning" title={t('friends.chatLimit')} />
            <div className="flex flex-col gap-4 h-96 justify-between">
              {isLoading && loadingType === 'messages' ? (
                <div className="text-center">
                  <Spinner size="sm" />
                </div>
              ) : (
                <ScrollShadow className="h-full" ref={messagesRef}>
                  <div className="flex flex-col gap-2">
                    {messages.map((msg, index) => {
                      const sender =
                        account && msg.sender === authData?.sub
                          ? { nickname: account.nickname, image: account.image }
                          : friend.user

                      const modpack = chatModpacks.find((m) => m._id === msg.message.value)
                      const version = modpack
                        ? versions.find((v) => v.version.shareCode === modpack._id)
                        : undefined

                      return (
                        <div key={index} className="flex items-center gap-2">
                          <Avatar
                            src={sender.image || ''}
                            size="sm"
                            className="min-w-8 min-h-8"
                            name={sender.nickname}
                          />
                          <div className="flex flex-col">
                            {msg.message._type === 'text' && (
                              <span className="break-all">
                                <p>{msg.message.value}</p>
                              </span>
                            )}
                            {msg.message._type === 'modpack' &&
                              (loadingIndex === index ? (
                                <div className="flex items-center gap-2">
                                  <Spinner size="sm" />
                                  <p>{t('friends.chatAttachmentLoading')}</p>
                                </div>
                              ) : modpack ? (
                                <Card>
                                  <CardBody>
                                    <div className="flex items-center gap-2">
                                      {modpack.conf.image && (
                                        <img
                                          src={modpack.conf.image}
                                          className="h-8 w-8 rounded-md"
                                        />
                                      )}
                                      <p>{modpack.conf.name}</p>
                                      <Button
                                        size="sm"
                                        color="secondary"
                                        variant="flat"
                                        isIconOnly
                                        onPress={() => onPlayModpack(modpack, version)}
                                      >
                                        <Gamepad2 size={20} />
                                      </Button>
                                    </div>
                                  </CardBody>
                                </Card>
                              ) : (
                                <p className="text-sm" style={{ color: 'orange' }}>
                                  {t('friends.chatAttachmentLoadError')}
                                </p>
                              ))}
                            <p className="text-xs text-gray-500">
                              {formatDate(new Date(msg.time))}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollShadow>
              )}
              <div className="flex items-center gap-2 w-full">
                <ButtonGroup>
                  <Button
                    isDisabled={shareableVersions.length === 0}
                    variant="flat"
                    isIconOnly
                    onPress={onOpenVersionSelect}
                  >
                    <Package size={20} />
                  </Button>
                </ButtonGroup>
                <div className="w-full">
                  <Input
                    value={messageText}
                    baseRef={messageInputRef}
                    isDisabled={
                      isLoading && (loadingType === 'messageSend' || loadingType === 'messages')
                    }
                    onChange={(e) => onMessageChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && messageText.trim()) {
                        onSendMessage()
                      }
                    }}
                  />
                </div>
                <Button
                  variant="flat"
                  isIconOnly
                  isDisabled={
                    !messageText.trim() ||
                    (isLoading && (loadingType === 'messageSend' || loadingType === 'messages'))
                  }
                  isLoading={isLoading && loadingType === 'messageSend'}
                  onPress={onSendMessage}
                >
                  <SendHorizontal size={20} />
                </Button>
              </div>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
