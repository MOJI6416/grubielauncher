import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  accountAtom,
  authDataAtom,
  rpcSkinVersionAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { streamerActiveAtom } from "@renderer/features/streamer/streamerMode";

const api = window.api;

export function RpcHost() {
  const { i18n } = useTranslation();
  const selectedAccount = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const settings = useAtomValue(settingsAtom);
  const rpcSkinVersion = useAtomValue(rpcSkinVersionAtom);
  const isStreaming = useAtomValue(streamerActiveAtom);
  const hideServer = settings.hideServerInRpc || isStreaming;

  useEffect(() => {
    void api.rpc.syncContext({
      account: selectedAccount
        ? {
            nickname: selectedAccount.nickname,
            type: selectedAccount.type,
            uuid: authData?.uuid,
          }
        : null,
      lang: i18n.resolvedLanguage || i18n.language || "en",
      hideServer,
      skinVersion: rpcSkinVersion,
    });
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    selectedAccount?.nickname,
    selectedAccount?.type,
    authData?.uuid,
    hideServer,
    rpcSkinVersion,
  ]);

  return null;
}
