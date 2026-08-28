import { IUpdateStatus } from "@/types/IFriend";

export function applyPresenceUpdate(
  previous: Required<IUpdateStatus>,
  update: IUpdateStatus,
): Required<IUpdateStatus> {
  return {
    versionName:
      update.versionName === undefined
        ? previous.versionName
        : update.versionName,
    versionCode:
      update.versionCode === undefined
        ? previous.versionCode
        : update.versionCode,
    serverAddress:
      update.serverAddress === undefined
        ? previous.serverAddress
        : update.serverAddress,
  };
}

export function sharePresenceKey(shareState: {
  phase: string;
  slug?: string | null;
  publicAddress?: string | null;
  sessionId?: string | null;
  visibility?: string | null;
}): string {
  if (
    shareState.phase === "online" &&
    shareState.slug &&
    shareState.publicAddress
  ) {
    return `online:${shareState.sessionId || ""}:${shareState.slug}:${
      shareState.visibility || ""
    }`;
  }

  return "offline";
}
