import { useEffect, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  accountAtom,
  settingsAtom,
  isShareModalOpenAtom,
  shareOwnerAccountKeyAtom,
  sharePeersAtom,
  shareStateAtom,
} from "@renderer/stores/atoms";
import { getShareErrorText } from "@renderer/utilities/share";
import {
  canCurrentAccountManageShare,
  getShareAccountKey,
  isShareStateActiveForAccountBinding,
} from "@renderer/utilities/shareAccount";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { shareGuestLinksAtom } from "@renderer/features/share/guestLinks";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { showOverlayToast } from "@renderer/features/overlay/overlayToasts";

const api = window.api;

export function ShareHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const [shareState, setShareState] = useAtom(shareStateAtom);
  const setSharePeers = useSetAtom(sharePeersAtom);
  const setIsShareModalOpen = useSetAtom(isShareModalOpenAtom);
  const [shareOwnerAccountKey, setShareOwnerAccountKey] = useAtom(
    shareOwnerAccountKeyAtom,
  );
  const selectedAccount = useAtomValue(accountAtom);
  const setGuestLinks = useSetAtom(shareGuestLinksAtom);
  const directConnect = useAtomValue(settingsAtom).directConnect;
  const streamerActive = useRedact().active;
  const previousLanDetectionRef = useRef<{
    phase: string;
    candidateKey: string | null;
  }>({ phase: "idle", candidateKey: null });

  useEffect(() => {
    let cancelled = false;

    const initShare = async () => {
      try {
        const [state, peers] = await Promise.all([
          api.share.getShareState(),
          api.share.getSharePeers(),
        ]);

        if (!cancelled) {
          setShareState(state);
          setSharePeers(peers);
        }
      } catch {}
    };

    initShare();

    const unsubscribeState = api.share.onShareStateChanged((state) => {
      setShareState(state);
    });

    const unsubscribePeers = api.share.onSharePeersChanged((peers) => {
      setSharePeers(peers);
    });

    const unsubscribeError = api.share.onShareError((error) => {
      toast(getShareErrorText(tRef.current, error));
    });

    const unsubscribeRefused = api.share.onGuestRefused((event) => {
      const name = event.username || tRef.current("share.panel.guests.unknown");
      toast.info(tRef.current(`share.refused.${event.reason}`, { name }));
    });

    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribePeers();
      unsubscribeError();
      unsubscribeRefused();
    };
  }, [setSharePeers, setShareState, tRef]);

  useEffect(() => {
    void api.share
      .setDirectPolicy({ directConnect, streamerMode: streamerActive })
      .catch(ignoreFailure);
  }, [directConnect, streamerActive]);

  useEffect(() => {
    void api.share.getGuestLinks().then(setGuestLinks, ignoreFailure);
    return api.share.onGuestLinksChanged(setGuestLinks);
  }, [setGuestLinks]);

  useEffect(() => {
    const isActive = isShareStateActiveForAccountBinding(shareState);
    if (!isActive) {
      if (shareOwnerAccountKey) setShareOwnerAccountKey(null);
      return;
    }

    if (
      !shareOwnerAccountKey &&
      selectedAccount &&
      selectedAccount.type !== "plain"
    ) {
      setShareOwnerAccountKey(getShareAccountKey(selectedAccount));
    }
  }, [
    selectedAccount,
    setShareOwnerAccountKey,
    shareOwnerAccountKey,
    shareState,
  ]);

  useEffect(() => {
    if (canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)) {
      return;
    }

    setIsShareModalOpen(false);
  }, [selectedAccount, setIsShareModalOpen, shareOwnerAccountKey]);

  useEffect(() => {
    const previous = previousLanDetectionRef.current;
    const candidateKey = shareState.candidate?.key ?? null;
    const isLanDetected =
      shareState.phase === "lan_ready" && candidateKey !== null;
    const justDetected =
      isLanDetected &&
      (previous.phase !== "lan_ready" ||
        previous.candidateKey !== candidateKey);

    previousLanDetectionRef.current = {
      phase: shareState.phase,
      candidateKey,
    };

    if (!justDetected) return;

    if (!selectedAccount || selectedAccount.type === "plain") return;

    setShareOwnerAccountKey(getShareAccountKey(selectedAccount));

    if (document.hasFocus()) {
      setIsShareModalOpen(true);
      return;
    }

    const title = tRef.current("share.detected.title");
    const body = tRef.current("share.detected.body");
    toast(title, {
      id: "share:lan",
      description: body,
      duration: 15000,
      action: {
        label: tRef.current("share.detected.open"),
        onClick: () => setIsShareModalOpen(true),
      },
    });

    void showOverlayToast({
      id: "share:lan",
      kind: "invite",
      title,
      body: () => body,
      face: null,
      accept: () => {
        setIsShareModalOpen(true);
        void api.other.restoreWindow();
      },
    })
      .then((shown) => {
        if (shown) return;
        return api.other.notify({ title, body }, { type: "share_open" });
      })
      .catch(ignoreFailure);
  }, [
    selectedAccount,
    setIsShareModalOpen,
    setShareOwnerAccountKey,
    shareState.candidate?.key,
    shareState.phase,
    tRef,
  ]);

  return null;
}
