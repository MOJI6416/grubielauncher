import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { accountAtom, pendingWebLoginAtom } from "../../stores/atoms";
import { Confirmation } from "./Confirmation";

import { showFailureToast } from "@renderer/utilities/failures";
const api = window.api;

export function WebLoginPrompt() {
  const { t } = useTranslation();
  const [requestId, setRequestId] = useAtom(pendingWebLoginAtom);
  const account = useAtomValue(accountAtom);

  if (!requestId) return null;

  const close = () => setRequestId(null);

  const approve = async () => {
    const token = account?.accessToken;
    if (!token) {
      toast.error(t("webLogin.noAccount"));
      close();
      return;
    }

    const ok = await api.backend.approveSiteLogin(token, requestId);
    if (ok) {
      toast.success(t("webLogin.approved"));
    } else {
      showFailureToast(t("webLogin.failed"), undefined, {
        channels: ["backend:approveSiteLogin"],
        fallbackDescription: t("webLogin.failedHint"),
      });
    }
    close();
  };

  return (
    <Confirmation
      onClose={close}
      title={t("webLogin.title")}
      content={[
        {
          text: account?.nickname
            ? t("webLogin.body", { nickname: account.nickname })
            : t("webLogin.bodyNoName"),
        },
        { text: t("webLogin.hint"), color: "warning" },
      ]}
      buttons={[
        { text: t("webLogin.decline"), color: "secondary", onClick: close },
        { text: t("webLogin.approve"), color: "primary", onClick: approve },
      ]}
    />
  );
}
