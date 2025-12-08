import { useEffect, useRef, useState } from 'react'
import { IUser } from '@/types/IUser'
import { FaDiscord, FaMicrosoft } from 'react-icons/fa'
import { TbSquareLetterE } from 'react-icons/tb'
import { IFriend } from '@/types/IFriend'
import { useTranslation } from 'react-i18next'
import { SkinView } from './SkinView'
import { IMessage } from '@/types/IMessage'
import { ILocalFriend } from '@/types/ILocalFriend'
import {
  CalendarClock,
  Check,
  ClipboardCopy,
  Earth,
  Gamepad2,
  Mail,
  Mailbox,
  Package,
  SendHorizontal,
  Shirt,
  User,
  UserMinus,
  UserPlus,
  Volume,
  VolumeX,
  X
} from 'lucide-react'
import AccountInfo from './Account/AccountInfo'
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  backendServiceAtom,
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
import { AddVersion } from './Modals/Version/AddVersion'
import {
  addToast,
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
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
import { Version } from '@renderer/game/Version'
import { formatDate } from '@renderer/utilities/Other'
import { getSkin } from '@renderer/utilities/Skin'
import { RunGameParams } from '@renderer/App'

const api = window.api
const path = api.path
const fs = api.fs
const clipboard = api.clipboard

export interface IFriendRequest {
  requestId: string
  user: IUser
  type: 'requester' | 'recipient'
}

export function Friends({ runGame }: { runGame: (params: RunGameParams) => Promise<void> }) {
  const [isLoading, setIsLoading] = useState(false)
  const [friends, setFriends] = useState<IFriend[]>([])
  const [addFriend, setAddFriend] = useState(false)
  const [friendId, setFriendId] = useState('')
  const [isRequests, setIsRequests] = useState(false)
  const [loadingType, setLoadingType] = useState<
    | 'general'
    | 'friendRequest'
    | 'accept'
    | 'reject'
    | 'skin'
    | 'messages'
    | 'messageSend'
    | 'friendRemove'
    | 'chatModpack'
  >()
  const [skinData, setSkinData] = useState<ISkinData>({
    skin: 'steve'
  })
  const [skinModal, setSkinModal] = useState(false)
  const [chatModal, setChatModal] = useState(false)
  const [messages, setMessages] = useState<IMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const [friendRemoveModal, setFriendRemoveModal] = useState(false)
  const [notReads, setNotReads] = useState<string[]>([])
  const [friend, setFriend] = useState<IFriend>()
  const messageInputRef = useRef<HTMLInputElement>(null)
  const [accountInfo, setAccountInfo] = useState(false)
  const [user, setUser] = useState<IUser>()
  const [account] = useAtom(accountAtom)
  const [accounts] = useAtom(accountsAtom)
  const [paths] = useAtom(pathsAtom)
  const [versions] = useAtom(versionsAtom)
  const [tempModpack, setTempModpack] = useState<IModpack>()
  const [isAddVersion, setIsAddVersion] = useState(false)
  const [isRunning] = useAtom(isRunningAtom)
  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom)
  const [socket] = useAtom(friendSocketAtom)
  const { t } = useTranslation()
  const [friendRequests, setFriendRequests] = useAtom(friendRequestsAtom)
  const [selectedFriend, setSelectedFriend] = useAtom(selectedFriendAtom)
  const [chatModpacks, setChatModpacks] = useState<IModpack[]>([])
  const [loadingIndex, setLoadingIndex] = useState(-1)
  const [isSelectVersions, setIsSelectVersions] = useState(false)
  const setSelectedVersion = useAtom(selectedVersionAtom)[1]
  const [authData] = useAtom(authDataAtom)
  const [backendService] = useAtom(backendServiceAtom)

  useEffect(() => {
    if (!socket) return

    socket.on('friends', async (data: { friends: IFriend[] }) => {
      if (loadingType == 'friendRemove') {
        setIsLoading(false)
        setLoadingType(undefined)

        const localIndex = localFriends.findIndex((lf) => lf.id == selectedFriend)

        if (localIndex != -1 && accounts) {
          const newLocalFriends = [...localFriends]

          newLocalFriends.splice(localIndex, 1)

          setLocalFriends(newLocalFriends)

          const accountIndex = accounts.findIndex(
            (a) => a.type == account?.type && a.nickname == account?.nickname
          )
          accounts[accountIndex].friends = newLocalFriends

          await fs.writeJSON(
            path.join(paths.launcher, 'accounts.json'),
            { accounts, lastPlayed: `${account?.type}_${account?.nickname}` },
            {
              encoding: 'utf-8',
              spaces: 2
            }
          )
        }

        const nickname = friends.find((f) => f.user._id == selectedFriend)?.user.nickname
        addToast({
          color: 'success',
          title: `${nickname} ${t('friends.deleted')}`
        })

        setSelectedFriend('')
        setFriendRemoveModal(false)
      }

      setFriends(data.friends)
    })

    socket.on('friendNotFound', () => {
      setLoadingType(undefined)
      setIsLoading(false)

      addToast({
        color: 'danger',
        title: t('friends.notFound')
      })
    })

    socket.on('friendUpdate', (data: IFriend) => {
      const index = friends.findIndex((f) => f.user._id == data.user._id)
      if (index == -1) return

      const newFriends = [...friends]
      newFriends[index] = { ...newFriends[index], ...data }
      setFriends(newFriends)
    })

    return () => {
      socket.off('friends')
      socket.off('friendUpdate')
      socket.off('friendNotFound')
    }
  }, [friends, selectedFriend, loadingType])

  useEffect(() => {
    if (!socket) return

    socket.on('getMessages', async (data: { messages: IMessage[] }) => {
      setMessages(data.messages)

      setIsLoading(false)
      setLoadingType(undefined)

      for (const msg of data.messages) {
        if (msg.message._type != 'modpack') continue
        if (chatModpacks.find((m) => m._id == msg.message.value)) continue

        setLoadingIndex(data.messages.indexOf(msg))
        const modpackData = await backendService.getModpack(msg.message.value)
        const modpack = modpackData.data

        if (modpack) setChatModpacks((prev) => [...prev, modpack])
        setLoadingIndex(-1)
      }
    })

    socket.on('sendMessage', async (message: IMessage) => {
      if (loadingType == 'messageSend') {
        setMessageText('')

        setIsLoading(false)
        setLoadingType(undefined)
      }

      if (message.sender != selectedFriend && message.sender != authData?.sub) return
      setMessages((prev) => [...prev, message])

      if (messageInputRef.current) {
        const input = messageInputRef.current.getElementsByTagName('input')[0]
        setTimeout(() => {
          input.focus()
        }, 0)
      }

      if (message.message._type == 'modpack') {
        if (chatModpacks.find((m) => m._id == message.message.value)) return
        setLoadingIndex(messages.length + 1)
        const modpackData = await backendService.getModpack(message.message.value)
        const modpack = modpackData.data
        if (modpack) setChatModpacks((prev) => [...prev, modpack])
        setLoadingIndex(-1)
      }
    })

    return () => {
      socket.off('getMessages')
      socket.off('sendMessage')
    }
  }, [selectedFriend, loadingType])

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTo(0, messagesRef.current.scrollHeight)
    }
  }, [messages])

  useEffect(() => {
    setTimeout(() => {
      messageInputRef?.current?.querySelector('input')?.focus()
    }, 200)
  }, [chatModal])

  useEffect(() => {
    if (!socket) return

    setIsLoading(true)
    setLoadingType('general')

    socket.emit('getFriends')

    socket.on('friendRequests', (data: { requests: IFriendRequest[] }) => {
      setFriendRequests(data.requests)
      setIsLoading(false)
      setLoadingType(undefined)
    })

    socket.on('notReads', (data: { users: string[] }) => {
      setNotReads(data.users)
    })

    return () => {
      socket.off('friendRequests')
      socket.off('notReads')
    }
  }, [])

  useEffect(() => {
    if (loadingType == 'accept' || loadingType == 'reject') {
      setIsLoading(false)
      setLoadingType(undefined)
    } else if (loadingType == 'friendRequest') {
      setIsLoading(false)
      setLoadingType(undefined)
      setAddFriend(false)
    }
  }, [friendRequests])

  return (
    <>
      <Card className="h-full w-[510px]" style={{ marginTop: '0px' }}>
        <CardHeader>
          <div className="flex items-center gap-2 w-full justify-between">
            <div className="flex items-center gap-2">
              <span
                className={isRequests ? 'cursor-pointer' : ''}
                onClick={() => {
                  setIsRequests(false)
                }}
              >
                <p className={!isRequests ? 'text-md font-bold' : 'text-md'}>
                  {t('friends.title')}
                </p>
              </span>
              <span
                className={!isRequests ? 'cursor-pointer' : ''}
                onClick={() => {
                  setIsRequests(true)
                }}
              >
                {!isRequests && friendRequests.filter((fr) => fr.type == 'recipient').length > 0 ? (
                  <Badge
                    size="sm"
                    color="warning"
                    variant="flat"
                    content={
                      <p className="text-sm font-bold">
                        +{friendRequests.filter((fr) => fr.type == 'recipient').length}
                      </p>
                    }
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
                <Button
                  variant="flat"
                  isIconOnly
                  onPress={() => {
                    if (!authData) return
                    clipboard.writeText(authData.sub)
                    addToast({
                      title: t('common.copied')
                    })
                  }}
                >
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
          {isLoading && loadingType == 'general' && (
            <div className="text-center">
              <Spinner size="sm" />
            </div>
          )}

          <ScrollShadow>
            <div className="flex flex-col gap-2">
              {!(isLoading && loadingType == 'general') && !isRequests && socket?.connected ? (
                friends.length > 0 ? (
                  <div className="flex flex-col space-y-4">
                    {friends.map((f, index) => {
                      let version: Version | undefined = undefined
                      if (f.versionCode != '') {
                        version = versions.find((v) => v.version.shareCode == f.versionCode)
                      }

                      const isNotRead = notReads.includes(f.user._id)

                      let local: ILocalFriend | undefined = undefined
                      const localIndex = localFriends.findIndex((lf) => lf.id == f.user._id)
                      if (localIndex != -1) local = localFriends[localIndex]

                      return (
                        <div key={index} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Dropdown>
                              <DropdownTrigger>
                                <div
                                  className="flex items-center gap-2 cursor-pointer min-w-0"
                                  onClick={() => {
                                    setSelectedFriend(f.user._id)
                                    setFriend(f)
                                  }}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Avatar
                                      src={f.user.image || ''}
                                      name={f.user.nickname}
                                      className="min-w-8 min-h-8"
                                      size="sm"
                                    />
                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center space-x-1 min-w-0">
                                        <p className="truncate flex-shrink">{f?.user?.nickname}</p>

                                        <div className="flex-shrink-0">
                                          {f?.user?.platform === 'microsoft' ? (
                                            <FaMicrosoft size={20} />
                                          ) : f?.user?.platform === 'elyby' ? (
                                            <TbSquareLetterE size={20} />
                                          ) : f?.user?.platform === 'discord' ? (
                                            <FaDiscord size={20} />
                                          ) : null}
                                        </div>
                                      </div>
                                      {f.isOnline && f.versionName != '' && (
                                        <div className="flex items-center space-x-1 min-w-0">
                                          <Gamepad2 size={16} className="flex-shrink-0" />
                                          <p className="text-xs truncate flex-grow">
                                            {f.versionName}
                                          </p>
                                        </div>
                                      )}
                                      {f.isOnline && f.serverAddress != '' && (
                                        <div className="flex items-center space-x-1 min-w-0">
                                          <Earth size={16} className="flex-shrink-0" />
                                          <p className="text-xs truncate flex-grow">
                                            {f.serverAddress}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <Chip
                                    variant="flat"
                                    color={f.isOnline ? 'success' : 'danger'}
                                    size="sm"
                                  >
                                    {f.isOnline ? t('friends.online') : t('friends.offline')}
                                  </Chip>

                                  {isNotRead && (
                                    <Chip color="warning" variant="flat">
                                      <Mailbox size={22} />
                                    </Chip>
                                  )}
                                </div>
                              </DropdownTrigger>
                              <DropdownMenu
                                disabledKeys={[
                                  'last',
                                  `${f.versionCode == '' || isRunning ? 'join' : ''}`
                                ]}
                              >
                                {!f.isOnline ? (
                                  <DropdownItem
                                    showDivider
                                    key="last"
                                    startContent={<CalendarClock size={22} />}
                                  >
                                    {formatDate(new Date(f.user.lastActive))}
                                  </DropdownItem>
                                ) : (
                                  <></>
                                )}

                                {f.versionName != '' ? (
                                  <DropdownItem
                                    key="join"
                                    className="text-secondary"
                                    color="secondary"
                                    onPress={async () => {
                                      if (version) {
                                        setSelectedVersion(version)
                                        await runGame({
                                          version,
                                          quick: {
                                            multiplayer: f.serverAddress ?? undefined
                                          }
                                        })
                                        return
                                      }

                                      const modpackData = await backendService.getModpack(
                                        f.versionCode
                                      )
                                      if (!modpackData.data) return
                                      const modpack = modpackData.data

                                      setTempModpack(modpack)
                                      setIsAddVersion(true)
                                    }}
                                    startContent={<Gamepad2 size={22} />}
                                  >
                                    {t('friends.join')}
                                  </DropdownItem>
                                ) : (
                                  <></>
                                )}

                                <DropdownItem
                                  key="account"
                                  onPress={async () => {
                                    try {
                                      if (!account || !account.accessToken) return

                                      const user = await backendService.getUser(f.user._id)

                                      if (user) {
                                        setUser(user)
                                        setAccountInfo(true)
                                        return
                                      }

                                      throw new Error()
                                    } catch {
                                      addToast({
                                        color: 'danger',
                                        title: t('accountInfo.error')
                                      })
                                    }
                                  }}
                                  startContent={<User size={22} />}
                                >
                                  {t('accountInfo.viewAccount')}
                                </DropdownItem>
                                <DropdownItem
                                  key="chat"
                                  onPress={() => {
                                    setIsLoading(true)
                                    setLoadingType('messages')

                                    setChatModal(true)

                                    notReads.splice(notReads.indexOf(f.user._id), 1)
                                    socket.emit('getMessages', { friendId: f.user._id })
                                  }}
                                  startContent={<Mail size={22} />}
                                >
                                  {t('friends.chat')}
                                </DropdownItem>
                                <DropdownItem
                                  key="skin"
                                  onPress={async () => {
                                    setIsLoading(true)
                                    setLoadingType('skin')
                                    setSkinModal(true)

                                    const skinData = await getSkin(
                                      f.user.platform,
                                      f.user.uuid,
                                      f.user.nickname,
                                      account?.accessToken
                                    )

                                    if (skinData) setSkinData(skinData)
                                    else {
                                      setSkinModal(false)
                                      addToast({
                                        color: 'danger',
                                        title: t('skinView.error')
                                      })
                                    }

                                    setIsLoading(false)
                                    setLoadingType(undefined)
                                  }}
                                  startContent={<Shirt size={22} />}
                                >
                                  {t('skinView.title')}
                                </DropdownItem>
                                <DropdownItem
                                  key="mute"
                                  onPress={async () => {
                                    if (!accounts) return

                                    const newLocalFriends = [...localFriends]

                                    if (!local) {
                                      local = { id: f.user._id, isMuted: true }
                                      newLocalFriends.push(local)
                                    } else {
                                      local.isMuted = !local.isMuted
                                      newLocalFriends[localIndex] = local
                                    }

                                    setLocalFriends(newLocalFriends)

                                    const accountIndex = accounts?.findIndex(
                                      (a) =>
                                        a.type == account?.type && a.nickname == account?.nickname
                                    )
                                    accounts[accountIndex].friends = newLocalFriends

                                    await fs.writeJSON(
                                      path.join(paths.launcher, 'accounts.json'),
                                      {
                                        accounts,
                                        lastPlayed: `${account?.type}_${account?.nickname}`
                                      },
                                      {
                                        encoding: 'utf-8',
                                        spaces: 2
                                      }
                                    )

                                    if (local.isMuted)
                                      addToast({
                                        color: 'success',
                                        title: t('friends.notificationDisabled')
                                      })
                                    else
                                      addToast({
                                        color: 'success',
                                        title: t('friends.notificationEnabled')
                                      })
                                  }}
                                  startContent={
                                    local?.isMuted ? <Volume size={22} /> : <VolumeX size={22} />
                                  }
                                >
                                  {local?.isMuted
                                    ? t('friends.enableNotifications')
                                    : t('friends.disableNotifications')}
                                </DropdownItem>

                                <DropdownItem
                                  key="remove"
                                  color="danger"
                                  className="text-danger"
                                  onPress={() => {
                                    setFriendRemoveModal(true)
                                  }}
                                  startContent={<UserMinus size={22} />}
                                >
                                  {t('common.delete')}
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        </div>
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
                    {friendRequests.map((fr, index) => {
                      return (
                        <div key={index} className="flex flex-col gap-1">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Avatar src={fr.user.image || ''} size="sm">
                                {!fr.user.image ? fr.user.nickname[0] : undefined}
                              </Avatar>
                              <div className="flex items-center gap-1 min-w-0">
                                <p className="truncate flex-grow">{fr?.user?.nickname}</p>
                                {fr.user.platform == 'microsoft' ? (
                                  <FaMicrosoft size={20} />
                                ) : fr.user.platform == 'elyby' ? (
                                  <TbSquareLetterE size={20} />
                                ) : fr.user.platform == 'discord' ? (
                                  <FaDiscord size={20} />
                                ) : undefined}
                              </div>
                            </div>
                            {fr.type == 'recipient' ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  size="sm"
                                  color="success"
                                  isDisabled={isLoading}
                                  isLoading={isLoading && loadingType == 'accept'}
                                  onPress={() => {
                                    if (!socket) return

                                    setIsLoading(true)
                                    setLoadingType('accept')

                                    socket.emit('acceptFriendRequest', { requestId: fr.requestId })
                                  }}
                                >
                                  <Check size={20} />
                                </Button>
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  size="sm"
                                  color="danger"
                                  isDisabled={isLoading}
                                  isLoading={isLoading && loadingType == 'reject'}
                                  onPress={() => {
                                    if (!socket) return

                                    setIsLoading(true)
                                    setLoadingType('reject')

                                    socket.emit('rejectFriendRequest', { requestId: fr.requestId })
                                  }}
                                >
                                  <X size={22} />
                                </Button>
                              </div>
                            ) : (
                              <p className="text-xs">{t('friends.requestSended')}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <Alert color="warning" title={t('friends.noRequests')} />
                )
              ) : undefined}
            </div>
          </ScrollShadow>
        </CardBody>
      </Card>

      <Modal
        isOpen={addFriend}
        size="sm"
        onClose={() => {
          setAddFriend(false)
        }}
      >
        <ModalContent>
          <ModalHeader>{t('friends.adding')}</ModalHeader>

          <ModalBody>
            <div className="flex items-center space-x-2">
              <p>{t('friends.friendId')}:</p>

              <Input
                isDisabled={isLoading}
                value={friendId}
                onChange={(e) => setFriendId(e.currentTarget.value.trim())}
                onKeyDown={(e) => {
                  if (e.key == 'Enter') {
                    if (
                      !socket ||
                      !!friends.find((f) => f?.user?._id == friendId) ||
                      friendId == authData?.sub ||
                      !!friendRequests.find((fr) => fr.user._id == friendId) ||
                      friendId == ''
                    )
                      return

                    setIsLoading(true)
                    setLoadingType('friendRequest')

                    socket.emit('friendRequest', { friendId })
                  }
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              color="primary"
              endContent={<SendHorizontal size={22} />}
              isLoading={isLoading && loadingType == 'friendRequest'}
              isDisabled={
                !!friends.find((f) => f?.user?._id == friendId) ||
                friendId == authData?.sub ||
                !!friendRequests.find((fr) => fr.user._id == friendId) ||
                friendId == ''
              }
              onPress={() => {
                if (!socket) return

                setIsLoading(true)
                setLoadingType('friendRequest')

                socket.emit('friendRequest', { friendId })
              }}
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
        <Modal
          isOpen={true}
          onClose={() => {
            setChatModal(false)
            setSelectedFriend('')
            setFriend(undefined)
          }}
        >
          <ModalContent>
            <ModalHeader>
              {t('friends.chatTitle')} {friend.user.nickname}
            </ModalHeader>

            <ModalBody>
              <div className="flex flex-col gap-4 justify-between">
                <Alert color="warning" title={t('friends.chatLimit')} />
                <div className="flex flex-col gap-4 h-96 justify-between">
                  {isLoading && loadingType == 'messages' ? (
                    <div className="text-center">
                      <Spinner size="sm" />
                    </div>
                  ) : (
                    <ScrollShadow className="h-full" ref={messagesRef}>
                      <div className="flex flex-col gap-2">
                        {messages.map((msg, index) => {
                          let sender: Partial<IUser>
                          if (account && msg.sender == authData?.sub)
                            sender = {
                              nickname: account.nickname,
                              image: account.image
                            }
                          else sender = { ...friend.user }

                          const modpack = chatModpacks.find((m) => m._id == msg.message.value)
                          let version: Version | undefined
                          if (modpack)
                            version = versions.find((v) => v.version.shareCode == modpack._id)

                          return (
                            <div key={index} className="flex items-center gap-2">
                              <Avatar
                                src={sender.image || ''}
                                size="sm"
                                className="min-w-8 min-h-8"
                                name={sender.nickname}
                              />

                              <div className="flex flex-col">
                                {msg.message._type == 'text' && (
                                  <span className="break-all">
                                    <p>{msg.message.value}</p>
                                  </span>
                                )}
                                {msg.message._type == 'modpack' &&
                                  (loadingIndex == index ? (
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
                                            onPress={async () => {
                                              if (version) {
                                                setSelectedVersion(version)
                                                setChatModal(false)

                                                await runGame({ version })

                                                return
                                              }

                                              setTempModpack(modpack)
                                              setIsAddVersion(true)
                                            }}
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
                        isDisabled={versions.filter((v) => v.version.shareCode).length == 0}
                        variant="flat"
                        isIconOnly
                        onPress={() => {
                          setIsSelectVersions(true)
                        }}
                      >
                        <Package size={20} />
                      </Button>
                    </ButtonGroup>
                    <div className="w-full">
                      <Input
                        value={messageText}
                        baseRef={messageInputRef}
                        isDisabled={
                          isLoading && (loadingType == 'messageSend' || loadingType == 'messages')
                        }
                        onChange={(event) => setMessageText(event.target.value)}
                        onKeyDown={(event) => {
                          if (!authData) return
                          if (event.key == 'Enter' && messageText.trim() != '') {
                            setIsLoading(true)
                            setLoadingType('messageSend')

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

                            setTimeout(() => {
                              messageInputRef?.current?.querySelector('input')?.focus()
                            }, 200)
                          }
                        }}
                      />
                    </div>

                    <Button
                      variant="flat"
                      isIconOnly
                      isDisabled={
                        messageText.trim() == '' ||
                        (isLoading && (loadingType == 'messageSend' || loadingType == 'messages'))
                      }
                      isLoading={isLoading && loadingType == 'messageSend'}
                      onPress={() => {
                        if (!authData) return
                        setIsLoading(true)
                        setLoadingType('messageSend')

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

                        setTimeout(() => {
                          messageInputRef?.current?.querySelector('input')?.focus()
                        }, 200)
                      }}
                    >
                      <SendHorizontal size={20} />
                    </Button>
                  </div>
                </div>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}

      {friend && socket && friendRemoveModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (isLoading) return

            setFriendRemoveModal(false)
            setFriend(undefined)
          }}
        >
          <ModalContent>
            <ModalHeader>{t('common.confirmation')}</ModalHeader>

            <ModalBody>
              <div className="flex flex-col gap-4">
                <Alert
                  color="warning"
                  title={`${t('friends.deleteAlert')} ${friend.user.nickname}?`}
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="flat"
                isLoading={isLoading && loadingType == 'friendRemove'}
                onPress={() => {
                  setIsLoading(true)
                  setLoadingType('friendRemove')

                  socket.emit('friendRemove', { friendId: friend.user._id })
                }}
              >
                {t('common.yes')}
              </Button>
              <Button
                variant="flat"
                onPress={() => {
                  setFriendRemoveModal(false)
                }}
              >
                {t('common.no')}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {accountInfo && account && accounts && user && (
        <AccountInfo
          onClose={() => {
            setAccountInfo(false)
          }}
          user={user}
          isOwner={false}
        />
      )}
      {isAddVersion && tempModpack && (
        <AddVersion closeModal={() => setIsAddVersion(false)} modpack={tempModpack} />
      )}

      {isSelectVersions && friend && (
        <Modal isOpen={true} onClose={() => setIsSelectVersions(false)} size="xs">
          <ModalContent>
            <ModalHeader>{t('versions.selectVersion')}</ModalHeader>

            <ModalBody>
              {versions.filter((v) => v.version.shareCode).length == 0 ? (
                <Alert color="warning" title={t('versions.noVersions')} />
              ) : (
                <ScrollShadow className="h-[300px]">
                  <div className="flex flex-col gap-2">
                    {versions
                      .filter((v) => v.version.shareCode)
                      .map((version, index) => {
                        return (
                          <Button
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
                            key={index}
                            onPress={async () => {
                              if (!account || !socket || !version.version.shareCode || !authData)
                                return

                              setIsSelectVersions(false)
                              setIsLoading(true)
                              setLoadingType('messageSend')

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
                            }}
                          >
                            <p>{version.version.name}</p>
                          </Button>
                        )
                      })}
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
