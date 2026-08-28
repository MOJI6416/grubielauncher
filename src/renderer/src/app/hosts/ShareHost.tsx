import { useEffect, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  accountAtom,
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

    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribePeers();
      unsubscribeError();
    };
  }, [setSharePeers, setShareState, tRef]);

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
    setIsShareModalOpen(true);
    void api.other.restoreWindow();
  }, [
    selectedAccount,
    setIsShareModalOpen,
    setShareOwnerAccountKey,
    shareState.candidate?.key,
    shareState.phase,
  ]);

  return null;
}
