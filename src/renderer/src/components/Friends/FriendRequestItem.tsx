import { Avatar, Button } from '@heroui/react'
import { getPlatformIcon, IFriendRequest, LoadingType } from './Friends'
import { Check, X } from 'lucide-react'

interface FriendRequestItemProps {
  request: IFriendRequest
  isLoading: boolean
  loadingType?: LoadingType
  onAccept: () => void
  onReject: () => void
  t: any
}

export function FriendRequestItem({
  request,
  isLoading,
  loadingType,
  onAccept,
  onReject,
  t
}: FriendRequestItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Avatar src={request.user.image || ''} size="sm">
            {!request.user.image ? request.user.nickname[0] : undefined}
          </Avatar>
          <div className="flex items-center gap-1 min-w-0">
            <p className="truncate flex-grow">{request.user.nickname}</p>
            {getPlatformIcon(request.user.platform)}
          </div>
        </div>
        {request.type === 'recipient' ? (
          <div className="flex items-center gap-1">
            <Button
              variant="flat"
              isIconOnly
              size="sm"
              color="success"
              isDisabled={isLoading}
              isLoading={isLoading && loadingType === 'accept'}
              onPress={onAccept}
            >
              <Check size={20} />
            </Button>
            <Button
              variant="flat"
              isIconOnly
              size="sm"
              color="danger"
              isDisabled={isLoading}
              isLoading={isLoading && loadingType === 'reject'}
              onPress={onReject}
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
}
