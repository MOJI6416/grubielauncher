import { useMemo } from "react";
import type { TFunction } from "i18next";
import { Headphones, Users } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { IGroupInvite } from "@/types/Voice";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import {
  GroupInviteRow,
  useInviteAnswers,
} from "@renderer/features/friends/RequestsPanel";
import type { GroupListEntry } from "./groupList";
import { VoiceRoomCard } from "./VoiceRooms";

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <p className="flex items-center gap-1.5 px-0.5 text-3xs font-medium tracking-wide text-faint uppercase">
      {label}
      <span className="font-mono tabular-nums">{count}</span>
    </p>
  );
}

export function GroupsOverview({
  voiceRooms,
  groupInvites,
  hasGroups,
  onAcceptGroupInvite,
  onDeclineGroupInvite,
  t,
}: {
  voiceRooms: GroupListEntry[];
  groupInvites: IGroupInvite[];
  hasGroups: boolean;
  onAcceptGroupInvite: (inviteId: string) => boolean;
  onDeclineGroupInvite: (inviteId: string) => boolean;
  t: TFunction;
}) {
  const answers = useInviteAnswers(
    groupInvites,
    onAcceptGroupInvite,
    onDeclineGroupInvite,
    t,
  );
  const inviteKeys = useMemo(
    () => new Set(groupInvites.map((invite) => invite._id)),
    [groupInvites],
  );

  if (voiceRooms.length === 0 && groupInvites.length === 0) {
    return (
      <Empty className="min-h-0 rounded-xl border border-solid border-border bg-card px-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {hasGroups ? <Headphones /> : <Users />}
          </EmptyMedia>
          <EmptyTitle>
            {hasGroups ? t("groups.overview.quietTitle") : t("friends.pickGroup")}
          </EmptyTitle>
          <EmptyDescription className="text-xs leading-5">
            {hasGroups
              ? t("friends.pickGroupHint")
              : t("groups.overview.noGroupsHint")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-card p-3">
      {voiceRooms.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <SectionLabel
            label={t("friends.hub.voice")}
            count={voiceRooms.length}
          />
          <div className="grid grid-cols-2 gap-2">
            {voiceRooms.map((entry) => (
              <VoiceRoomCard key={entry.group._id} entry={entry} t={t} />
            ))}
          </div>
        </div>
      )}

      {groupInvites.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1">
          <SectionLabel label={t("groups.invites")} count={groupInvites.length} />
          <RemovalList sourceKeys={inviteKeys}>
            {groupInvites.map((invite) => (
              <RemovalItem key={invite._id} itemKey={invite._id}>
                <GroupInviteRow invite={invite} answers={answers} t={t} />
              </RemovalItem>
            ))}
          </RemovalList>
        </div>
      )}
    </section>
  );
}
