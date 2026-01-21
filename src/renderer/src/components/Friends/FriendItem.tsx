import { useMemo } from 'react'
import { ILocalFriend } from '@/types/ILocalFriend'
import { Avatar, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react'
import {
  CalendarClock,
  Earth,
  Gamepad2,
  Mail,
  Mailbox,
  Shirt,
  User,
  UserMinus,
  Volume,
  VolumeX
} from 'lucide-react'
import { getPlatformIcon } from './Friends'
import { IFriend } from '@/types/IFriend'
import { formatDate } from '@renderer/utilities/date'

interface FriendItemProps {
  friend: IFriend
  isNotRead: boolean
  local?: ILocalFriend
  isRunning: boolean
  onSelect: () => void
  onJoin: () => void
  onViewAccount: () => void
  onOpenChat: () => void
  onViewSkin: () => void
  onToggleMute: () => void
  onRemove: () => void
  t: any
}

export function FriendItem({
  friend,
  isNotRead,
  local,
  isRunning,
  onSelect,
  onJoin,
  onViewAccount,
  onOpenChat,
  onViewSkin,
  onToggleMute,
  onRemove,
  t
}: FriendItemProps) {
  const canJoin = !!friend.versionName && friend.versionCode !== '' && !isRunning
  const disabledKeys = useMemo(() => {
    const keys = ['last'] as string[]
    if (!canJoin) keys.push('join')
    return keys
  }, [canJoin])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Dropdown>
          <DropdownTrigger>
            <div className="flex items-center gap-2 cursor-pointer min-w-0" onClick={onSelect}>
              <Avatar
                src={friend.user.image || ''}
                name={friend.user.nickname}
                className="min-w-8 min-h-8"
                size="sm"
              />

              <div className="flex flex-col min-w-0">
                <div className="flex items-center space-x-1 min-w-0">
                  <p className="truncate flex-shrink">{friend.user.nickname}</p>
                  <div className="flex-shrink-0">{getPlatformIcon(friend.user.platform)}</div>
                </div>

                {friend.isOnline && friend.versionName && (
                  <div className="flex items-center space-x-1 min-w-0">
                    <Gamepad2 size={16} className="flex-shrink-0" />
                    <p className="text-xs truncate flex-grow">{friend.versionName}</p>
                  </div>
                )}

                {friend.isOnline && friend.serverAddress && (
                  <div className="flex items-center space-x-1 min-w-0">
                    <Earth size={16} className="flex-shrink-0" />
                    <p className="text-xs truncate flex-grow">{friend.serverAddress}</p>
                  </div>
                )}
              </div>

              <Chip variant="flat" color={friend.isOnline ? 'success' : 'danger'} size="sm">
                {friend.isOnline ? t('friends.online') : t('friends.offline')}
              </Chip>

              {isNotRead && (
                <Chip color="warning" variant="flat">
                  <Mailbox size={22} />
                </Chip>
              )}
            </div>
          </DropdownTrigger>

          <DropdownMenu disabledKeys={disabledKeys}>
            {!friend.isOnline ? (
              <DropdownItem showDivider key="last" startContent={<CalendarClock size={22} />}>
                {formatDate(new Date(friend.user.lastActive))}
              </DropdownItem>
            ) : null}

            {friend.versionName ? (
              <DropdownItem
                key="join"
                className="text-secondary"
                color="secondary"
                onPress={onJoin}
                startContent={<Gamepad2 size={22} />}
              >
                {t('friends.join')}
              </DropdownItem>
            ) : null}

            <DropdownItem key="account" onPress={onViewAccount} startContent={<User size={22} />}>
              {t('accountInfo.viewAccount')}
            </DropdownItem>

            <DropdownItem key="chat" onPress={onOpenChat} startContent={<Mail size={22} />}>
              {t('friends.chat')}
            </DropdownItem>

            <DropdownItem key="skin" onPress={onViewSkin} startContent={<Shirt size={22} />}>
              {t('skinView.title')}
            </DropdownItem>

            <DropdownItem
              key="mute"
              onPress={onToggleMute}
              startContent={local?.isMuted ? <Volume size={22} /> : <VolumeX size={22} />}
            >
              {local?.isMuted
                ? t('friends.enableNotifications')
                : t('friends.disableNotifications')}
            </DropdownItem>

            <DropdownItem
              key="remove"
              color="danger"
              className="text-danger"
              onPress={onRemove}
              startContent={<UserMinus size={22} />}
            >
              {t('common.delete')}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  )
}
