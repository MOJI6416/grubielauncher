import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@renderer/components/Hint";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import type { IFriend } from "@/types/IFriend";
import type { ShareMember } from "@/types/Share";
import { SEAT_OPTIONS } from "./hostModel";

export function ShareSeatLimit({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const options = SEAT_OPTIONS.includes(value)
    ? SEAT_OPTIONS
    : [...SEAT_OPTIONS, value].sort((a, b) => a - b);

  return (
    <div className="flex h-8 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {t("share.panel.seats.title")}
      </span>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectTrigger
          size="sm"
          className="min-w-28 shrink-0"
          aria-label={t("share.panel.seats.title")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option === 0
                ? t("share.panel.seats.unlimited")
                : t("share.panel.seats.count", { count: option })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ShareMemberList({
  members,
  friends,
  joinedIds,
  disabled,
  onRemove,
}: {
  members: ShareMember[];
  friends: IFriend[];
  joinedIds: Set<string>;
  disabled: boolean;
  onRemove: (member: ShareMember) => void;
}) {
  const { t } = useTranslation();

  if (members.length === 0) {
    return (
      <p className="px-1 py-1 text-xs leading-4 text-faint">
        {t("share.panel.members.empty")}
      </p>
    );
  }

  return (
    <ul className="grid gap-0.5">
      {members.map((member) => {
        const friend = friends.find((entry) => entry.user?._id === member.userId);
        const nickname = friend?.user.nickname || member.nickname;
        const label = t("share.panel.members.remove", { name: nickname });

        return (
          <li
            key={member.userId}
            className="flex h-8 items-center gap-2.5 rounded-lg px-1"
          >
            <PlayerHead
              user={{
                id: member.userId,
                nickname,
                platform: friend?.user.platform,
                uuid: friend?.user.uuid,
              }}
              size={20}
            />
            <Hint content={nickname} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-sm">{nickname}</span>
            </Hint>
            {joinedIds.has(member.userId) && (
              <span className="shrink-0 text-xs whitespace-nowrap text-success">
                {t("share.panel.members.playing")}
              </span>
            )}
            <Hint content={label}>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={label}
                disabled={disabled}
                onClick={() => onRemove(member)}
              >
                <X />
              </Button>
            </Hint>
          </li>
        );
      })}
    </ul>
  );
}
