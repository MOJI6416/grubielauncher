import { memo } from "react";
import type { TFunction } from "i18next";
import { Copy, UserMinus } from "lucide-react";
import type { MsFriend } from "@/shared/msFriends";
import { HeadDot, PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { presenceDotColor } from "./presence";
import { PlatformIcon } from "./PlatformIcon";
import { msPresenceKind, msStatusKey } from "./msFriendsModel";

function MsFriendRowComponent({
  friend,
  t,
  onCopyNickname,
  onRemove,
}: {
  friend: MsFriend;
  t: TFunction;
  onCopyNickname: (name: string) => void;
  onRemove: (friend: MsFriend) => void;
}) {
  const kind = msPresenceKind(friend.status);
  const detail = t(msStatusKey(friend.status));

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex h-12 w-full min-w-0 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-row-hover has-[[data-state=open]]:bg-row-hover">
          <PlayerHead
            user={{
              _id: friend.profileId,
              nickname: friend.name,
              platform: "microsoft",
              uuid: friend.profileId,
            }}
            size={32}
            badge={
              <HeadDot
                label={t(kind === "playing" ? "friends.playing" : kind === "online" ? "friends.online" : "friends.offline")}
                className={presenceDotColor(kind)}
              />
            }
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <Hint content={friend.name} variant="text" truncatedOnly>
                <span className="min-w-0 truncate text-sm font-medium">
                  {friend.name}
                </span>
              </Hint>
              <span className="shrink-0 text-faint">
                <PlatformIcon platform="microsoft" />
              </span>
            </span>
            <Hint content={detail} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-2xs leading-4 text-muted-foreground">
                {detail}
              </span>
            </Hint>
          </span>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-60">
        <ContextMenuItem onSelect={() => onCopyNickname(friend.name)}>
          <Copy size={18} />
          {t("friends.copyNickname")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onRemove(friend)}>
          <UserMinus size={18} />
          {t("friends.microsoft.remove")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const MsFriendRow = memo(MsFriendRowComponent);
