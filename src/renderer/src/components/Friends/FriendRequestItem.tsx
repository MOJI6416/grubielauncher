import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getPlatformIcon, IFriendRequest, LoadingType } from "./Friends";
import { Check, Loader2, X } from "lucide-react";

interface FriendRequestItemProps {
  request: IFriendRequest;
  isLoading: boolean;
  loadingType?: LoadingType;
  onAccept: () => void;
  onReject: () => void;
  t: any;
}

export function FriendRequestItem({
  request,
  isLoading,
  loadingType,
  onAccept,
  onReject,
  t,
}: FriendRequestItemProps) {
  const isRecipient = request.type === "recipient";
  const initials = useMemo(
    () => request.user.nickname?.[0] ?? "?",
    [request.user.nickname],
  );
  const acceptLoading = isLoading && loadingType === "accept";
  const rejectLoading = isLoading && loadingType === "reject";

  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-card-foreground shadow-xs">
      <Avatar size="sm" className="h-8 w-8">
        {request.user.image && (
          <AvatarImage src={request.user.image} alt={request.user.nickname} />
        )}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <p className="min-w-0 truncate text-sm font-medium">
          {request.user.nickname}
        </p>
        <span className="shrink-0 text-muted-foreground">
          {getPlatformIcon(request.user.platform)}
        </span>
      </div>

      {isRecipient ? (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={isLoading}
            onClick={onAccept}
          >
            {acceptLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Check size={18} />
            )}
          </Button>

          <Button
            variant="destructive"
            size="icon-sm"
            disabled={isLoading}
            onClick={onReject}
          >
            {rejectLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <X size={18} />
            )}
          </Button>
        </div>
      ) : (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {t("friends.requestSended")}
          </p>
          <Button
            variant="destructive"
            size="icon-sm"
            disabled={isLoading}
            onClick={onReject}
            aria-label={t("friends.cancelRequest")}
            title={t("friends.cancelRequest")}
          >
            {rejectLoading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <X size={18} />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
