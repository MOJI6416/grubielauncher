import type { IVoiceCallState, IVoiceSessionState } from "@/types/Voice";
import { TRAY_MAX_INSTANCES, TrayLabels, TrayModel } from "@/types/Tray";
import { isVoiceLive, voiceRoomKind } from "@renderer/features/voice/roomModel";

export interface TrayInstanceSource {
  name: string;
  installed: boolean;
  lastLaunch?: Date | string | null;
  image?: string | null;
  minecraft?: string;
  loader?: string;
}

function launchedAt(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function buildTrayModel({
  lang,
  accent,
  instances,
  running,
  session,
  call,
  groupNames,
  closeToTray,
  updateVersion = null,
  labels,
}: {
  lang: string;
  accent: string;
  instances: TrayInstanceSource[];
  running: string[];
  session: Pick<
    IVoiceSessionState,
    | "state"
    | "roomId"
    | "roomName"
    | "isMicMuted"
    | "isDeafened"
    | "connectedAt"
  > & { participantCount: number };
  call: IVoiceCallState;
  groupNames: ReadonlyMap<string, string>;
  closeToTray: boolean;
  updateVersion?: string | null;
  labels: TrayLabels;
}): TrayModel {
  const playing = [...new Set(running)];
  const runningSet = new Set(playing);

  const recent = instances
    .filter((instance) => instance.installed && instance.name)
    .sort(
      (a, b) =>
        launchedAt(b.lastLaunch) - launchedAt(a.lastLaunch) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, TRAY_MAX_INSTANCES)
    .map((instance) => ({
      name: instance.name,
      running: runningSet.has(instance.name),
      ...(instance.image ? { image: instance.image } : {}),
      ...(instance.minecraft ? { minecraft: instance.minecraft } : {}),
      ...(instance.loader ? { loader: instance.loader } : {}),
    }));

  const voice = isVoiceLive(session.state)
    ? {
        title:
          voiceRoomKind(session.roomId) === "direct"
            ? session.roomName
            : (groupNames.get(session.roomId) ?? session.roomName),
        muted: session.isMicMuted,
        deafened: session.isDeafened,
        since: session.connectedAt,
        participants: session.participantCount,
      }
    : null;

  return {
    lang,
    accent,
    closeToTray,
    instances: recent,
    playing,
    voice,
    incomingCall:
      call.status === "incoming" && call.peer
        ? { nickname: call.peer.nickname }
        : null,
    updateVersion,
    labels,
  };
}
