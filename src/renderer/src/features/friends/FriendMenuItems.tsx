import type { TFunction } from "i18next";
import {
  CalendarClock,
  Copy,
  Headphones,
  PhoneCall,
  Play,
  Send,
  Shirt,
  User,
  UserMinus,
  Volume,
  VolumeX,
} from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@renderer/utilities/date";
import type { FriendEntry } from "./friendsList";
import { canJoinFriend } from "./presence";
import { isDmRoomWith } from "./voiceRoom";

export interface FriendMenuActions {
  onJoin: (friendId: string) => void;
  onInvite: (friendId: string) => void;
  onStartCall: (friendId: string) => void;
  onInviteToVoice?: (friendId: string) => void;
  onViewProfile: (friendId: string) => void;
  onViewSkin: (friendId: string) => void;
  onToggleMute: (friendId: string) => void;
  onCopyNickname: (friendId: string) => void;
  onRemove: (friendId: string) => void;
}

export function FriendMenuItems({
  menu,
  entry,
  isGameRunning,
  isCallBusy,
  ownUserId,
  voiceRoomId,
  actions,
  t,
}: {
  menu: "dropdown" | "context";
  entry: FriendEntry;
  isGameRunning: boolean;
  isCallBusy: boolean;
  ownUserId?: string;
  voiceRoomId?: string;
  actions: FriendMenuActions;
  t: TFunction;
}) {
  const Item = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const { friend, presence, isMuted } = entry;
  const id = friend.user._id;
  const canJoin = canJoinFriend(presence, isGameRunning);
  const canViewSkin = !(
    friend.user.platform === "microsoft" && !friend.user.uuid
  );
  const isCallDisabled = isCallBusy || isDmRoomWith(voiceRoomId, ownUserId, id);
  const lastSeen = presence.lastActiveAt
    ? formatDate(new Date(presence.lastActiveAt))
    : "";

  return (
    <>
      {presence.kind === "offline" && lastSeen && (
        <>
          <Item disabled>
            <CalendarClock />
            {t("friends.lastSeen", { value: lastSeen })}
          </Item>
          <Separator />
        </>
      )}

      {presence.hasJoinTarget && (
        <Item disabled={!canJoin} onSelect={() => actions.onJoin(id)}>
          <Play />
          {t("friends.join")}
        </Item>
      )}

      <Item disabled={!friend.isOnline} onSelect={() => actions.onInvite(id)}>
        <Send />
        {t("friends.invite")}
      </Item>

      <Item
        disabled={!friend.isOnline || isCallDisabled}
        onSelect={() => actions.onStartCall(id)}
      >
        <PhoneCall />
        {t("voiceCall.start")}
      </Item>

      {actions.onInviteToVoice && (
        <Item
          disabled={!friend.isOnline}
          onSelect={() => actions.onInviteToVoice?.(id)}
        >
          <Headphones />
          {t("groups.inviteToVoice")}
        </Item>
      )}

      <Separator />

      <Item onSelect={() => actions.onViewProfile(id)}>
        <User />
        {t("friends.openProfile")}
      </Item>

      <Item disabled={!canViewSkin} onSelect={() => actions.onViewSkin(id)}>
        <Shirt />
        {t("skinView.title")}
      </Item>

      <Item onSelect={() => actions.onCopyNickname(id)}>
        <Copy />
        {t("friends.copyNickname")}
      </Item>

      <Item onSelect={() => actions.onToggleMute(id)}>
        {isMuted ? <Volume /> : <VolumeX />}
        {isMuted
          ? t("friends.enableNotifications")
          : t("friends.disableNotifications")}
      </Item>

      <Separator />

      <Item variant="destructive" onSelect={() => actions.onRemove(id)}>
        <UserMinus />
        {t("friends.deleteAction")}
      </Item>
    </>
  );
}
