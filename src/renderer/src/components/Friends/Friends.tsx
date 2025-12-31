import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { IUser } from '@/types/IUser'
import { FaDiscord, FaMicrosoft } from 'react-icons/fa'
import { TbSquareLetterE } from 'react-icons/tb'
import { IFriend } from '@/types/IFriend'
import { useTranslation } from 'react-i18next'
import { SkinView } from '../SkinView'
import { IMessage } from '@/types/IMessage'
import { ILocalFriend } from '@/types/ILocalFriend'
import { ClipboardCopy, SendHorizontal, UserPlus } from 'lucide-react'
import AccountInfo from '../Account/AccountInfo'
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  friendRequestsAtom,
  friendSocketAtom,
  isRunningAtom,
  localFriendsAtom,
  pathsAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  versionsAtom
} from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { IModpack } from '@/types/Backend'
import { AddVersion } from '../Modals/Version/AddVersion'
import {
  addToast,
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ScrollShadow,
  Spinner,
  Tooltip,
  Image,
  ModalFooter
} from '@heroui/react'
import { ISkinData } from '@/types/Skin'
import { RunGameParams } from '@renderer/App'
import { Version } from '@renderer/classes/Version'
import { ChatModal } from './ChatModal'
import { FriendItem } from './FriendItem'
import { FriendRequestItem } from './FriendRequestItem'

const api = window.api

export interface IFriendRequest {
  requestId: string
  user: IUser
  type: 'requester' | 'recipient'
}

export type LoadingType =
  | 'general'
  | 'friendRequest'
  | 'accept'
  | 'reject'
  | 'skin'
  | 'messages'
  | 'messageSend'
  | 'friendRemove'
  | 'chatModpack'

export function Friends({ runGame }: { runGame: (params: RunGameParams) => Promise<void> }) {
  const { t } = useTranslation()

  const [account] = useAtom(accountAtom)
  const [accounts] = useAtom(accountsAtom)
  const [paths] = useAtom(pathsAtom)
  const [versions] = useAtom(versionsAtom)
  const [isRunning] = useAtom(isRunningAtom)
  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom)
  const [socket] = useAtom(friendSocketAtom)
  const [friendRequests, setFriendRequests] = useAtom(friendRequestsAtom)
  const [selectedFriend, setSelectedFriend] = useAtom(selectedFriendAtom)
  const [authData] = useAtom(authDataAtom)
  const [, setSelectedVersion] = useAtom(selectedVersionAtom)

  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<LoadingType>()
  const [friends, setFriends] = useState<IFriend[]>([])
  const [notReads, setNotReads] = useState<string[]>([])

  const [isRequests, setIsRequests] = useState(false)
  const [addFriend, setAddFriend] = useState(false)
  const [skinModal, setSkinModal] = useState(false)
  const [chatModal, setChatModal] = useState(false)
  const [friendRemoveModal, setFriendRemoveModal] = useState(false)
  const [accountInfo, setAccountInfo] = useState(false)
  const [isAddVersion, setIsAddVersion] = useState(false)
  const [isSelectVersions, setIsSelectVersions] = useState(false)

  const [friendId, setFriendId] = useState('')
  const [friend, setFriend] = useState<IFriend>()
  const [user, setUser] = useState<IUser>()
  const [skinData, setSkinData] = useState<ISkinData>({ skin: 'steve' })
  const [messages, setMessages] = useState<IMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [chatModpacks, setChatModpacks] = useState<IModpack[]>([])
  const [loadingIndex, setLoadingIndex] = useState(-1)
  const [tempModpack, setTempModpack] = useState<IModpack>()

  const messagesRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)

  const stopLoading = useCallback(() => {
    setIsLoading(false)
    setLoadingType(undefined)
  }, [])

  const startLoading = useCallback((type: LoadingType) => {
    setIsLoading(true)
    setLoadingType(type)
  }, [])

  const saveLocalFriends = useCallback(
    async (newLocalFriends: ILocalFriend[]) => {
      if (!accounts || !account) return

      setLocalFriends(newLocalFriends)

      const accountIndex = accounts.findIndex(
        (a) => a.type === account.type && a.nickname === account.nickname
      )

      if (accountIndex === -1) return

      accounts[accountIndex].friends = newLocalFriends

      await api.fs.writeJSON(await api.path.join(paths.launcher, 'accounts.json'), {
        accounts,
        lastPlayed: `${account.type}_${account.nickname}`
      })
    },
    [accounts, account, paths.launcher, setLocalFriends]
  )

  const focusMessageInput = useCallback(() => {
    setTimeout(() => {
      messageInputRef?.current?.querySelector('input')?.focus()
    }, 200)
  }, [])

  useEffect(() => {
    if (!socket) return

    const handleFriends = async (data: { friends: IFriend[] }) => {
      if (loadingType === 'friendRemove') {
        stopLoading()

        const localIndex = localFriends.findIndex((lf) => lf.id === selectedFriend)

        if (localIndex !== -1) {
          const newLocalFriends = [...localFriends]
          newLocalFriends.splice(localIndex, 1)
          await saveLocalFriends(newLocalFriends)
        }

        const nickname = friends.find((f) => f.user._id === selectedFriend)?.user.nickname
        addToast({
          color: 'success',
          title: `${nickname} ${t('friends.deleted')}`
        })

        setSelectedFriend('')
        setFriendRemoveModal(false)
      }

      setFriends(data.friends)
    }

    const handleFriendNotFound = () => {
      stopLoading()
      addToast({
        color: 'danger',
        title: t('friends.notFound')
      })
    }

    const handleFriendUpdate = (data: IFriend) => {
      setFriends((prev) => {
        const index = prev.findIndex((f) => f.user._id === data.user._id)
        if (index === -1) return prev

        const newFriends = [...prev]
        newFriends[index] = { ...newFriends[index], ...data }
        return newFriends
      })
    }

    socket.on('friends', handleFriends)
    socket.on('friendNotFound', handleFriendNotFound)
    socket.on('friendUpdate', handleFriendUpdate)

    return () => {
      socket.off('friends', handleFriends)
      socket.off('friendUpdate', handleFriendUpdate)
      socket.off('friendNotFound', handleFriendNotFound)
    }
  }, [socket, friends, selectedFriend, loadingType, localFriends, saveLocalFriends, stopLoading, t])

  useEffect(() => {
    if (!socket || !account) return

    const loadModpack = async (modpackId: string, messageIndex: number) => {
      if (chatModpacks.find((m) => m._id === modpackId)) return

      setLoadingIndex(messageIndex)
      try {
        const modpackData = await api.backend.getModpack(account.accessToken || '', modpackId)
        if (modpackData.data) {
          setChatModpacks((prev) => [...prev, modpackData.data!])
        }
      } finally {
        setLoadingIndex(-1)
      }
    }

    const handleGetMessages = async (data: { messages: IMessage[] }) => {
      setMessages(data.messages)
      stopLoading()

      for (const msg of data.messages) {
        if (msg.message._type === 'modpack') {
          await loadModpack(msg.message.value, data.messages.indexOf(msg))
        }
      }
    }

    const handleSendMessage = async (message: IMessage) => {
      if (loadingType === 'messageSend') {
        setMessageText('')
        stopLoading()
      }

      if (message.sender !== selectedFriend && message.sender !== authData?.sub) return

      setMessages((prev) => [...prev, message])
      focusMessageInput()

      if (message.message._type === 'modpack') {
        await loadModpack(message.message.value, messages.length + 1)
      }
    }

    socket.on('getMessages', handleGetMessages)
    socket.on('sendMessage', handleSendMessage)

    return () => {
      socket.off('getMessages', handleGetMessages)
      socket.off('sendMessage', handleSendMessage)
    }
  }, [
    socket,
    account,
    selectedFriend,
    loadingType,
    messages.length,
    chatModpacks,
    authData,
    stopLoading,
    focusMessageInput
  ])

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight)
  }, [messages])

  useEffect(() => {
    if (chatModal) focusMessageInput()
  }, [chatModal, focusMessageInput])

  useEffect(() => {
    if (!socket) return

    startLoading('general')
    socket.emit('getFriends')

    const handleFriendRequests = (data: { requests: IFriendRequest[] }) => {
      setFriendRequests(data.requests)
      stopLoading()
    }

    const handleNotReads = (data: { users: string[] }) => {
      setNotReads(data.users)
    }

    socket.on('friendRequests', handleFriendRequests)
    socket.on('notReads', handleNotReads)

    return () => {
      socket.off('friendRequests', handleFriendRequests)
      socket.off('notReads', handleNotReads)
    }
  }, [socket, startLoading, stopLoading, setFriendRequests])

  useEffect(() => {
    if (loadingType === 'accept' || loadingType === 'reject') {
      stopLoading()
    } else if (loadingType === 'friendRequest') {
      stopLoading()
      setAddFriend(false)
    }
  }, [friendRequests, loadingType, stopLoading])

  const handleCopyId = useCallback(async () => {
    if (!authData) return
    await api.clipboard.writeText(authData.sub)
    addToast({ title: t('common.copied') })
  }, [authData, t])

  const handleSendFriendRequest = useCallback(() => {
    if (!socket || !friendId) return
    startLoading('friendRequest')
    socket.emit('friendRequest', { friendId })
  }, [socket, friendId, startLoading])

  const handleAcceptRequest = useCallback(
    (requestId: string) => {
      if (!socket) return
      startLoading('accept')
      socket.emit('acceptFriendRequest', { requestId })
    },
    [socket, startLoading]
  )

  const handleRejectRequest = useCallback(
    (requestId: string) => {
      if (!socket) return
      startLoading('reject')
      socket.emit('rejectFriendRequest', { requestId })
    },
    [socket, startLoading]
  )

  const handleViewAccount = useCallback(
    async (userId: string) => {
      try {
        if (!account?.accessToken) return

        const userData = await api.backend.getUser(account.accessToken, userId)
        if (userData) {
          setUser(userData)
          setAccountInfo(true)
        } else {
          throw new Error()
        }
      } catch {
        addToast({
          color: 'danger',
          title: t('accountInfo.error')
        })
      }
    },
    [account, t]
  )

  const handleOpenChat = useCallback(
    (friendId: string) => {
      if (!socket) return

      startLoading('messages')
      setChatModal(true)

      const index = notReads.indexOf(friendId)
      if (index !== -1) {
        setNotReads((prev) => prev.filter((id) => id !== friendId))
      }

      socket.emit('getMessages', { friendId })
    },
    [socket, notReads, startLoading]
  )

  const handleViewSkin = useCallback(
    async (friend: IFriend) => {
      startLoading('skin')
      setSkinModal(true)

      const skinData = await api.skin.get(
        friend.user.platform,
        friend.user.uuid,
        friend.user.nickname,
        account?.accessToken
      )

      if (skinData) {
        setSkinData(skinData)
      } else {
        setSkinModal(false)
        addToast({
          color: 'danger',
          title: t('skinView.error')
        })
      }

      stopLoading()
    },
    [account, startLoading, stopLoading, t]
  )

  const handleToggleMute = useCallback(
    async (friend: IFriend, local: ILocalFriend | undefined, localIndex: number) => {
      const newLocalFriends = [...localFriends]

      if (!local) {
        local = { id: friend.user._id, isMuted: true }
        newLocalFriends.push(local)
      } else {
        local.isMuted = !local.isMuted
        newLocalFriends[localIndex] = local
      }

      await saveLocalFriends(newLocalFriends)

      addToast({
        color: 'success',
        title: local.isMuted ? t('friends.notificationDisabled') : t('friends.notificationEnabled')
      })
    },
    [localFriends, saveLocalFriends, t]
  )

  const handleRemoveFriend = useCallback(() => {
    if (!socket || !friend) return
    startLoading('friendRemove')
    socket.emit('friendRemove', { friendId: friend.user._id })
  }, [socket, friend, startLoading])

  const handleSendMessage = useCallback(() => {
    if (!authData || !socket || !friend || !messageText.trim()) return

    startLoading('messageSend')

    const message: IMessage = {
      sender: authData.sub,
      message: {
        _type: 'text',
        value: messageText
      },
      time: new Date()
    }

    socket.emit('sendMessage', {
      message,
      recipient: friend.user._id
    })

    focusMessageInput()
  }, [authData, socket, friend, messageText, startLoading, focusMessageInput])

  const handleSendModpack = useCallback(
    async (version: Version) => {
      if (!account || !socket || !version.version.shareCode || !authData || !friend) return

      setIsSelectVersions(false)
      startLoading('messageSend')

      const message: IMessage = {
        sender: authData.sub,
        message: {
          _type: 'modpack',
          value: version.version.shareCode
        },
        time: new Date()
      }

      socket.emit('sendMessage', {
        message,
        recipient: friend.user._id
      })
    },
    [account, socket, authData, friend, startLoading]
  )

  const handleJoinFriend = useCallback(
    async (friend: IFriend, version: Version | undefined) => {
      if (version) {
        setSelectedVersion(version)
        await runGame({
          version,
          quick: {
            multiplayer: friend.serverAddress ?? undefined
          }
        })
        return
      }

      const modpackData = await api.backend.getModpack(
        account?.accessToken || '',
        friend.versionCode
      )

      if (modpackData.data) {
        setTempModpack(modpackData.data)
        setIsAddVersion(true)
      }
    },
    [account, runGame, setSelectedVersion]
  )

  const isFriendIdInvalid = useMemo(() => {
    return (
      !!friends.find((f) => f?.user?._id === friendId) ||
      friendId === authData?.sub ||
      !!friendRequests.find((fr) => fr.user._id === friendId) ||
      friendId === ''
    )
  }, [friends, friendId, authData, friendRequests])

  const recipientRequests = useMemo(
    () => friendRequests.filter((fr) => fr.type === 'recipient'),
    [friendRequests]
  )

  const shareableVersions = useMemo(() => versions.filter((v) => v.version.shareCode), [versions])

  return (
    <>
      <Card className="h-full w-[510px]" style={{ marginTop: '0px' }}>
        <CardHeader>
          <div className="flex items-center gap-2 w-full justify-between">
            <div className="flex items-center gap-2">
              <span
                className={isRequests ? 'cursor-pointer' : ''}
                onClick={() => setIsRequests(false)}
              >
                <p className={!isRequests ? 'text-md font-bold' : 'text-md'}>
                  {t('friends.title')}
                </p>
              </span>
              <span
                className={!isRequests ? 'cursor-pointer' : ''}
                onClick={() => setIsRequests(true)}
              >
                {!isRequests && recipientRequests.length > 0 ? (
                  <Badge
                    size="sm"
                    color="warning"
                    variant="flat"
                    content={<p className="text-sm font-bold">+{recipientRequests.length}</p>}
                  >
                    <p className={isRequests ? 'text-md font-bold' : 'text-md'}>
                      {t('friends.requests')}
                    </p>
                  </Badge>
                ) : (
                  <p className={isRequests ? 'text-md font-bold' : 'text-md'}>
                    {t('friends.requests')}
                  </p>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip content={t('friends.copyId')} delay={1000}>
                <Button variant="flat" isIconOnly onPress={handleCopyId}>
                  <ClipboardCopy size={22} />
                </Button>
              </Tooltip>
              <Tooltip content={t('friends.sendRequest')} delay={1000}>
                <Button
                  variant="flat"
                  isIconOnly
                  onPress={() => {
                    setFriendId('')
                    setFriend(undefined)
                    setAddFriend(true)
                  }}
                >
                  <UserPlus size={22} />
                </Button>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {isLoading && loadingType === 'general' && (
            <div className="text-center">
              <Spinner size="sm" />
            </div>
          )}

          <ScrollShadow>
            <div className="flex flex-col gap-2">
              {!(isLoading && loadingType === 'general') && !isRequests && socket?.connected ? (
                friends.length > 0 ? (
                  <div className="flex flex-col space-y-4">
                    {friends.map((f) => {
                      const version = f.versionCode
                        ? versions.find((v) => v.version.shareCode === f.versionCode)
                        : undefined

                      const isNotRead = notReads.includes(f.user._id)
                      const localIndex = localFriends.findIndex((lf) => lf.id === f.user._id)
                      const local = localIndex !== -1 ? localFriends[localIndex] : undefined

                      return (
                        <FriendItem
                          key={f.user._id}
                          friend={f}
                          isNotRead={isNotRead}
                          local={local}
                          isRunning={isRunning}
                          onSelect={() => {
                            setSelectedFriend(f.user._id)
                            setFriend(f)
                          }}
                          onJoin={() => handleJoinFriend(f, version)}
                          onViewAccount={() => handleViewAccount(f.user._id)}
                          onOpenChat={() => handleOpenChat(f.user._id)}
                          onViewSkin={() => handleViewSkin(f)}
                          onToggleMute={() => handleToggleMute(f, local, localIndex)}
                          onRemove={() => setFriendRemoveModal(true)}
                          t={t}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <Alert color="warning" title={t('friends.noFriends')} />
                )
              ) : undefined}

              {isRequests && socket?.connected ? (
                friendRequests.length > 0 ? (
                  <div className="flex flex-col gap-4 overflow-auto pr-2">
                    {friendRequests.map((fr) => (
                      <FriendRequestItem
                        key={fr.requestId}
                        request={fr}
                        isLoading={isLoading}
                        loadingType={loadingType}
                        onAccept={() => handleAcceptRequest(fr.requestId)}
                        onReject={() => handleRejectRequest(fr.requestId)}
                        t={t}
                      />
                    ))}
                  </div>
                ) : (
                  <Alert color="warning" title={t('friends.noRequests')} />
                )
              ) : undefined}
            </div>
          </ScrollShadow>
        </CardBody>
      </Card>

      <Modal isOpen={addFriend} size="sm" onClose={() => setAddFriend(false)}>
        <ModalContent>
          <ModalHeader>{t('friends.adding')}</ModalHeader>
          <ModalBody>
            <Input
              label={t('friends.friendId')}
              isDisabled={isLoading}
              value={friendId}
              onChange={(e) => setFriendId(e.currentTarget.value.trim())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isFriendIdInvalid) {
                  handleSendFriendRequest()
                }
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              color="primary"
              endContent={<SendHorizontal size={22} />}
              isLoading={isLoading && loadingType === 'friendRequest'}
              isDisabled={isFriendIdInvalid}
              onPress={handleSendFriendRequest}
            >
              {t('friends.send')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {friend && skinModal && (
        <SkinView
          skinData={skinData}
          nickname={friend.user.nickname}
          isOwner={false}
          onClose={() => {
            setSkinModal(false)
            setFriend(undefined)
          }}
        />
      )}

      {friend && socket && chatModal && (
        <ChatModal
          friend={friend}
          messages={messages}
          messageText={messageText}
          isLoading={isLoading}
          loadingType={loadingType}
          loadingIndex={loadingIndex}
          chatModpacks={chatModpacks}
          versions={versions}
          shareableVersions={shareableVersions}
          messagesRef={messagesRef}
          messageInputRef={messageInputRef}
          account={account}
          authData={authData}
          onClose={() => {
            setChatModal(false)
            setSelectedFriend('')
            setFriend(undefined)
          }}
          onMessageChange={setMessageText}
          onSendMessage={handleSendMessage}
          onOpenVersionSelect={() => setIsSelectVersions(true)}
          onPlayModpack={async (modpack: IModpack, version?: Version) => {
            if (version) {
              setSelectedVersion(version)
              setChatModal(false)
              await runGame({ version })
            } else {
              setTempModpack(modpack)
              setIsAddVersion(true)
            }
          }}
          t={t}
        />
      )}

      {friend && socket && friendRemoveModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!isLoading) {
              setFriendRemoveModal(false)
              setFriend(undefined)
            }
          }}
        >
          <ModalContent>
            <ModalHeader>{t('common.confirmation')}</ModalHeader>
            <ModalBody>
              <Alert
                color="warning"
                title={`${t('friends.deleteAlert')} ${friend.user.nickname}?`}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="flat"
                isLoading={isLoading && loadingType === 'friendRemove'}
                onPress={handleRemoveFriend}
              >
                {t('common.yes')}
              </Button>
              <Button variant="flat" onPress={() => setFriendRemoveModal(false)}>
                {t('common.no')}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {accountInfo && user && (
        <AccountInfo onClose={() => setAccountInfo(false)} user={user} isOwner={false} />
      )}

      {isAddVersion && tempModpack && (
        <AddVersion closeModal={() => setIsAddVersion(false)} modpack={tempModpack} />
      )}

      {isSelectVersions && friend && (
        <Modal isOpen={true} onClose={() => setIsSelectVersions(false)} size="xs">
          <ModalContent>
            <ModalHeader>{t('versions.selectVersion')}</ModalHeader>
            <ModalBody>
              {shareableVersions.length === 0 ? (
                <Alert color="warning" title={t('versions.noVersions')} />
              ) : (
                <ScrollShadow className="h-[300px]">
                  <div className="flex flex-col gap-2">
                    {shareableVersions.map((version) => (
                      <Button
                        key={version.version.shareCode}
                        startContent={
                          version.version.image && (
                            <Image
                              src={version.version.image}
                              className="min-h-7 min-w-7"
                              width={28}
                              height={28}
                            />
                          )
                        }
                        variant="flat"
                        onPress={() => handleSendModpack(version)}
                      >
                        <p>{version.version.name}</p>
                      </Button>
                    ))}
                  </div>
                </ScrollShadow>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </>
  )
}

export function getPlatformIcon(platform: string) {
  switch (platform) {
    case 'microsoft':
      return <FaMicrosoft size={20} />
    case 'elyby':
      return <TbSquareLetterE size={20} />
    case 'discord':
      return <FaDiscord size={20} />
    default:
      return null
  }
}
