import { useMemo } from 'react'
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
  const isRecipient = request.type === 'recipient'
  const initials = useMemo(() => request.user.nickname?.[0] ?? '?', [request.user.nickname])
  const acceptLoading = isLoading && loadingType === 'accept'
  const rejectLoading = isLoading && loadingType === 'reject'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar src={request.user.image || ''} size="sm" name={request.user.nickname}>
            {!request.user.image ? initials : undefined}
          </Avatar>

          <div className="flex items-center gap-1 min-w-0">
            <p className="truncate flex-grow">{request.user.nickname}</p>
            <span className="flex-shrink-0">{getPlatformIcon(request.user.platform)}</span>
          </div>
        </div>

        {isRecipient ? (
          <div className="flex items-center gap-1">
            <Button
              variant="flat"
              isIconOnly
              size="sm"
              color="success"
              isDisabled={isLoading}
              isLoading={acceptLoading}
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
              isLoading={rejectLoading}
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
