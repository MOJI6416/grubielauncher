import type { TFunction } from "i18next";
import {
  BellOff,
  BellRing,
  DoorOpen,
  Headphones,
  MessageSquare,
  Pencil,
  PhoneOff,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { IGroup } from "@/types/Voice";
import { groupPermissions } from "./permissions";

export type GroupMenuIntent = "rename" | "leave" | "delete";

export interface GroupMenuActions {
  onOpenChat?: () => void;
  onOpenSettings?: () => void;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onInviteToGame: () => void;
  onIntent: (intent: GroupMenuIntent) => void;
}

export function GroupMenuItems({
  menu,
  group,
  isActiveRoom,
  isBusy,
  isMuted,
  canInviteToGame,
  actions,
  t,
}: {
  menu: "dropdown" | "context";
  group: IGroup;
  isActiveRoom: boolean;
  isBusy: boolean;
  isMuted: boolean;
  canInviteToGame: boolean;
  actions: GroupMenuActions;
  t: TFunction;
}) {
  const Item = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const permissions = groupPermissions(group);

  return (
    <>
      {actions.onOpenChat && (
        <Item onSelect={actions.onOpenChat}>
          <MessageSquare />
          {t("groups.chat")}
        </Item>
      )}
      {isActiveRoom ? (
        <Item onSelect={actions.onLeaveVoice}>
          <PhoneOff />
          {t("voice.disconnect")}
        </Item>
      ) : (
        <Item disabled={isBusy} onSelect={actions.onJoinVoice}>
          <Headphones />
          {t("groups.join")}
        </Item>
      )}
      <Item onSelect={actions.onToggleMute}>
        {isMuted ? <BellRing /> : <BellOff />}
        {isMuted
          ? t("groups.unmuteNotifications")
          : t("groups.muteNotifications")}
      </Item>
      <Item disabled={!canInviteToGame} onSelect={actions.onInviteToGame}>
        <Send />
        {t("groups.inviteToGame")}
      </Item>

      <Separator />

      {actions.onOpenSettings && (
        <Item onSelect={actions.onOpenSettings}>
          <Settings2 />
          {t("groups.manage")}
        </Item>
      )}
      {permissions.canRename && (
        <Item onSelect={() => actions.onIntent("rename")}>
          <Pencil />
          {t("groups.rename")}
        </Item>
      )}
      {permissions.canDelete ? (
        <Item variant="destructive" onSelect={() => actions.onIntent("delete")}>
          <Trash2 />
          {t("groups.delete")}
        </Item>
      ) : (
        <Item variant="destructive" onSelect={() => actions.onIntent("leave")}>
          <DoorOpen />
          {t("groups.leave")}
        </Item>
      )}
    </>
  );
}
