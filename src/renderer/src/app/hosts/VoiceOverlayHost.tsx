import { useCallback, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import {
  accountAtom,
  consolesMetaAtom,
  rpcSkinVersionAtom,
  settingsAtom,
  voiceSessionAtom,
} from "@renderer/stores/atoms";
import { resolveHeadUrl } from "@renderer/features/accounts/AccountHead";
import { useFaceLookup } from "@renderer/features/accounts/faceDirectory";
import { getApiBase } from "@renderer/utilities/apiBase";
import {
  buildOverlayState,
  sameOverlayState,
} from "@renderer/features/voice/overlay";
import {
  HIDDEN_VOICE_OVERLAY,
  type IVoiceParticipantState,
  type VoiceOverlayState,
} from "@/types/Voice";

export function VoiceOverlayHost() {
  const session = useAtomValue(voiceSessionAtom);
  const consoles = useAtomValue(consolesMetaAtom);
  const isEnabled = useAtomValue(settingsAtom).voiceOverlay;
  const account = useAtomValue(accountAtom);
  const skinVersion = useAtomValue(rpcSkinVersionAtom);
  const faceOf = useFaceLookup();
  const isGameRunning = consoles.some((meta) => meta.status === "running");
  const sentRef = useRef<VoiceOverlayState>(HIDDEN_VOICE_OVERLAY);

  const headUrlOf = useCallback(
    (participant: IVoiceParticipantState) =>
      resolveHeadUrl(
        faceOf({ _id: participant.identity, nickname: participant.name }),
        getApiBase(),
        account,
        skinVersion,
      ),
    [account, faceOf, skinVersion],
  );

  useEffect(() => {
    const next = buildOverlayState(
      session,
      isGameRunning,
      isEnabled,
      headUrlOf,
    );
    if (sameOverlayState(sentRef.current, next)) return;
    sentRef.current = next;
    void window.api.voice.updateOverlay(next).catch(() => undefined);
  }, [session, isGameRunning, isEnabled, headUrlOf]);

  return null;
}
