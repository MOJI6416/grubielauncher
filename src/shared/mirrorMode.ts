import { DownloadSource } from "@/types/Settings";

export interface MirrorState {
  source: DownloadSource;
  mirrorDisabled: boolean;
  mojangReachable: boolean | null;
}

export type MirrorMode =
  | "official"
  | "mirror"
  | "mirror-cooldown"
  | "official-first";

export function resolveMirrorMode({
  source,
  mirrorDisabled,
  mojangReachable,
}: MirrorState): MirrorMode {
  if (source === "official") return "official";

  if (source === "mirror") {
    return mirrorDisabled ? "mirror-cooldown" : "mirror";
  }

  if (mojangReachable === false) {
    return mirrorDisabled ? "mirror-cooldown" : "mirror";
  }

  return "official-first";
}

export function isMirrorNoteworthy(mode: MirrorMode): boolean {
  return mode !== "official-first";
}
