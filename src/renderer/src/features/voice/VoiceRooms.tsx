import { useState } from "react";
import { getDefaultStore } from "jotai";
import type { TFunction } from "i18next";
import { Headphones, Loader2, MessageSquare, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IGroup } from "@/types/Voice";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { useFaceLookup } from "@renderer/features/accounts/faceDirectory";
import { Hint } from "@renderer/components/Hint";
import { accountAtom, openGroupChatIdAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { showFailureToast } from "@renderer/utilities/failures";
import { voiceConnect, voiceDisconnect } from "@renderer/utilities/voiceClient";
import { voiceJoinErrorKey } from "./errors";
import { groupInitials, type GroupListEntry } from "./groupList";
import { splitOverflow } from "./participants";

const api = window.api;
const MAX_FACES = 5;

export async function joinGroupVoice(
  group: IGroup,
  t: TFunction,
): Promise<boolean> {
  const accessToken = getDefaultStore().get(accountAtom)?.accessToken;
  if (!accessToken) return false;

  try {
    const grant = await api.backend.groupJoinVoice(accessToken, group._id);
    if (!grant) {
      showFailureToast(t("groups.joinError"), undefined, {
        channels: ["backend:groupJoinVoice"],
      });
      return false;
    }
    await voiceConnect(grant, {
      roomId: group._id,
      roomName: group.name,
      isRoomOwner: group.isOwner,
    });
    return true;
  } catch (error) {
    showFailureToast(t(voiceJoinErrorKey(error)), error, {
      context: { side: "grubie" },
    });
    return false;
  }
}

export function VoiceJoinButton({
  isActiveRoom,
  isBusy,
  onJoin,
  compact = false,
  className,
  t,
}: {
  isActiveRoom: boolean;
  isBusy: boolean;
  onJoin: () => void;
  compact?: boolean;
  className?: string;
  t: TFunction;
}) {
  const label = isActiveRoom ? t("voice.disconnect") : t("groups.join");
  const icon = isBusy ? (
    <Loader2 className="size-3.5 animate-spin" />
  ) : isActiveRoom ? (
    <PhoneOff className="size-3.5" />
  ) : (
    <Headphones className="size-3.5" />
  );

  if (compact) {
    return (
      <Hint content={isBusy ? undefined : label}>
        <Button
          size="icon-sm"
          variant={isActiveRoom ? "ghost" : "secondary"}
          className={cn("size-7", isActiveRoom && "text-destructive", className)}
          disabled={isBusy}
          aria-label={label}
          onClick={isActiveRoom ? () => void voiceDisconnect() : onJoin}
        >
          {icon}
        </Button>
      </Hint>
    );
  }

  return (
    <Button
      size="sm"
      variant={isActiveRoom ? "outline" : "secondary"}
      className={cn("h-7 shrink-0", isActiveRoom && "text-destructive", className)}
      disabled={isBusy}
      onClick={isActiveRoom ? () => void voiceDisconnect() : onJoin}
    >
      {icon}
      {label}
    </Button>
  );
}

export function openGroupChat(groupId: string) {
  getDefaultStore().set(openGroupChatIdAtom, groupId);
  navigate({ name: "people", section: "groups" });
}

export function VoiceRoomCard({
  entry,
  t,
}: {
  entry: GroupListEntry;
  t: TFunction;
}) {
  const faceOf = useFaceLookup();
  const [isJoining, setIsJoining] = useState(false);
  const { group, voiceCount, voiceIdentities, isActiveRoom } = entry;
  const faces = splitOverflow(
    voiceIdentities
      .map((identity) =>
        group.members.find((member) => member._id === identity),
      )
      .filter((member) => member !== undefined),
    MAX_FACES,
  );
  const names = faces.visible.map((member) => member.nickname).join(", ");

  const join = async () => {
    setIsJoining(true);
    try {
      await joinGroupVoice(group, t);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border p-2.5",
        isActiveRoom
          ? "border-success/40 bg-success/10"
          : "border-border bg-surface-2",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-2xs font-semibold text-muted-foreground">
          {groupInitials(group.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <Hint content={group.name} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-sm font-medium">
              {group.name}
            </span>
          </Hint>
          <span className="truncate text-2xs leading-4 text-success">
            {t("voice.inVoiceCount", { count: voiceCount })}
          </span>
        </span>
        <Hint content={t("groups.chat")}>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label={t("groups.chat")}
            onClick={() => openGroupChat(group._id)}
          >
            <MessageSquare className="size-3.5" />
          </Button>
        </Hint>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span
          role="img"
          aria-label={names}
          className="flex min-w-0 flex-1 items-center -space-x-1.5"
        >
          {faces.visible.map((member) => (
            <AccountHead
              key={member._id}
              account={faceOf(member)}
              size={22}
              className="ring-2 ring-card"
            />
          ))}
          {faces.hidden > 0 && (
            <span className="flex size-5.5 items-center justify-center rounded-md bg-surface-3 font-mono text-4xs tabular-nums text-muted-foreground ring-2 ring-card">
              +{faces.hidden}
            </span>
          )}
        </span>
        <VoiceJoinButton
          isActiveRoom={isActiveRoom}
          isBusy={isJoining}
          onJoin={() => void join()}
          t={t}
        />
      </div>
    </div>
  );
}
