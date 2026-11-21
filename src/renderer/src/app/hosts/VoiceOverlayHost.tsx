import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
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
  withOverlayToasts,
} from "@renderer/features/voice/overlay";
import { participantInitials } from "@renderer/features/voice/participants";
import {
  acceptOverlayToast,
  overlayToastsAtom,
} from "@renderer/features/overlay/overlayToasts";
import {
  latestActionable,
  nextExpiry,
  pruneToasts,
  type ToastFace,
} from "@renderer/features/overlay/toastQueue";
import {
  HIDDEN_VOICE_OVERLAY,
  type IVoiceParticipantState,
  type OverlayToast,
  type VoiceOverlayState,
} from "@/types/Voice";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { companionSessionsAtom } from "@renderer/features/companion/companionStore";
import type { CompanionToast } from "@/shared/companion";

export function VoiceOverlayHost() {
  const { t } = useTranslation();
  const session = useAtomValue(voiceSessionAtom);
  const consoles = useAtomValue(consolesMetaAtom);
  const settings = useAtomValue(settingsAtom);
  const [queued, setQueued] = useAtom(overlayToastsAtom);
  const isEnabled = settings.voiceOverlay;
  const corner = settings.voiceOverlayCorner;
  const displayId = settings.voiceOverlayDisplay;
  const acceptBind = settings.overlayAcceptBind;
  const account = useAtomValue(accountAtom);
  const skinVersion = useAtomValue(rpcSkinVersionAtom);
  const faceOf = useFaceLookup();
  const isGameRunning = consoles.some((meta) => meta.status === "running");
  const companionSessions = useAtomValue(companionSessionsAtom);
  const setCompanionSessions = useSetAtom(companionSessionsAtom);
  const companionLive = companionSessions.length > 0;
  const sentRef = useRef<VoiceOverlayState>(HIDDEN_VOICE_OVERLAY);
  const acceptRef = useRef("");

  const headOf = useCallback(
    (face: ToastFace) =>
      resolveHeadUrl(
        faceOf({ _id: face._id ?? face.nickname, nickname: face.nickname }),
        getApiBase(),
        account,
        skinVersion,
      ),
    [account, faceOf, skinVersion],
  );

  const headUrlOf = useCallback(
    (participant: IVoiceParticipantState) =>
      headOf({ _id: participant.identity, nickname: participant.name }),
    [headOf],
  );

  useEffect(() => {
    if (!isGameRunning && queued.length > 0) setQueued([]);
  }, [isGameRunning, queued.length, setQueued]);

  useEffect(() => {
    const at = nextExpiry(queued);
    if (at === null) return;
    const timer = setTimeout(
      () => setQueued((list) => pruneToasts(list, Date.now())),
      Math.max(0, at - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [queued, setQueued]);

  const actionable = latestActionable(queued);

  const toasts = useMemo<OverlayToast[]>(
    () =>
      queued.map((toast) => ({
        id: toast.id,
        kind: toast.kind,
        title: toast.title,
        body: toast.body(toast.count),
        initials: participantInitials(toast.face?.nickname ?? toast.title),
        headUrl: toast.face ? headOf(toast.face) : null,
        action:
          toast.accept && acceptBind && toast.id === actionable?.id
            ? t("overlay.acceptHint", { key: acceptBind.label })
            : null,
      })),
    [acceptBind, actionable?.id, headOf, queued, t],
  );

  useEffect(() => {
    const bind = actionable && acceptBind ? acceptBind : null;
    const key = bind ? `${bind.type}:${bind.code}` : "";
    if (acceptRef.current === key) return;
    acceptRef.current = key;
    void window.api.voice
      .setOverlayAccept(bind ? { type: bind.type, code: bind.code } : null)
      .catch(ignoreFailure);
  }, [acceptBind, actionable]);

  useEffect(() => window.api.voice.onOverlayAccept(() => acceptOverlayToast()), []);

  useEffect(() => {
    let cancelled = false;
    void window.api.companion
      .sessions()
      .then((sessions) => {
        if (!cancelled) setCompanionSessions(sessions);
      })
      .catch(ignoreFailure);
    const offStatus = window.api.companion.onStatus(setCompanionSessions);
    const offAccept = window.api.companion.onAccept((id) => {
      acceptOverlayToast(id);
    });
    return () => {
      cancelled = true;
      offStatus();
      offAccept();
    };
  }, [setCompanionSessions]);

  useEffect(() => {
    const items: CompanionToast[] = companionLive
      ? queued.map((toast) => ({
          id: toast.id,
          kind: toast.kind,
          title: toast.title,
          body: toast.body(toast.count),
          count: toast.count,
          actionable: Boolean(toast.accept),
          ...(toast.face?._id ? { avatar: toast.face._id } : {}),
        }))
      : [];
    void window.api.companion.setToasts(items).catch(ignoreFailure);
  }, [companionLive, queued]);

  useEffect(() => {
    const placement = { corner, displayId };
    const next = withOverlayToasts(
      buildOverlayState(session, isGameRunning, isEnabled && !companionLive, headUrlOf, placement),
      companionLive ? [] : toasts,
      isGameRunning,
      placement,
    );
    if (sameOverlayState(sentRef.current, next)) return;
    sentRef.current = next;
    void window.api.voice.updateOverlay(next).catch(ignoreFailure);
  }, [
    session,
    isGameRunning,
    isEnabled,
    headUrlOf,
    corner,
    displayId,
    toasts,
    companionLive,
  ]);

  return null;
}
