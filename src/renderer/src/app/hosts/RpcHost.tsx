import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  accountAtom,
  authDataAtom,
  rpcSkinVersionAtom,
  settingsAtom,
} from "@renderer/stores/atoms";

const api = window.api;

export function RpcHost() {
  const { i18n } = useTranslation();
  const selectedAccount = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const settings = useAtomValue(settingsAtom);
  const rpcSkinVersion = useAtomValue(rpcSkinVersionAtom);

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
      hideServer: settings.hideServerInRpc,
      skinVersion: rpcSkinVersion,
    });
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    selectedAccount?.nickname,
    selectedAccount?.type,
    authData?.uuid,
    settings.hideServerInRpc,
    rpcSkinVersion,
  ]);

  return null;
}
