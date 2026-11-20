import type { TFunction } from "i18next";
import { Check, Loader2, X } from "lucide-react";
import type { MsFriend } from "@/shared/msFriends";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { PlatformIcon } from "./PlatformIcon";

export function MsRequestRow({
  request,
  isIncoming,
  isPending,
  onAccept,
  onReject,
  t,
}: {
  request: MsFriend;
  isIncoming: boolean;
  isPending: boolean;
  onAccept: () => void;
  onReject: () => void;
  t: TFunction;
}) {
  const detail = isIncoming
    ? t("friends.microsoft.wantsToBeFriend")
    : t("friends.microsoft.requestSent");
  const rejectLabel = isIncoming
    ? t("friends.declineRequest")
    : t("friends.cancelRequest");

  return (
    <div className="flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-row-hover">
      <PlayerHead
        user={{
          _id: request.profileId,
          nickname: request.name,
          platform: "microsoft",
          uuid: request.profileId,
        }}
        size={36}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Hint content={request.name} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-sm font-medium">
              {request.name}
            </span>
          </Hint>
          <span className="shrink-0 text-faint">
            <PlatformIcon platform="microsoft" />
          </span>
        </span>
        <Hint content={detail} variant="text" truncatedOnly>
          <span className="truncate text-2xs leading-4 text-muted-foreground">
            {detail}
          </span>
        </Hint>
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {isIncoming && (
          <Hint content={t("friends.acceptRequest")}>
            <Button
              size="icon-sm"
              variant="secondary"
              disabled={isPending}
              aria-label={t("friends.acceptRequest")}
              onClick={onAccept}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check size={18} />
              )}
            </Button>
          </Hint>
        )}
        <Hint content={rejectLabel}>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={isPending}
            aria-label={rejectLabel}
            onClick={onReject}
          >
            {isPending && !isIncoming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X size={18} />
            )}
          </Button>
        </Hint>
      </div>
    </div>
  );
}
