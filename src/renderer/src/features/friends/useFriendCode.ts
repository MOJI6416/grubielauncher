import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { IAuth } from "@/types/Account";
import { showFailureToast } from "@renderer/utilities/failures";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

export function useFriendCode(
  accessToken: string | undefined,
  authData: IAuth | undefined,
) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | undefined>(authData?.friendCode);
  const [isEnabled, setIsEnabled] = useState(
    authData?.friendRequestsEnabled !== false,
  );
  const [isResetting, setIsResetting] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(accessToken));

  useEffect(() => {
    setCode(authData?.friendCode);
    setIsEnabled(authData?.friendRequestsEnabled !== false);

    if (!accessToken || !authData?.sub) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      const user = await api.backend
        .getUser(accessToken, authData.sub)
        .catch(() => null);
      if (cancelled) return;

      setIsLoading(false);
      if (!user) return;

      setCode(user.friendCode);
      setIsEnabled(user.friendRequestsEnabled !== false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authData?.sub]);

  const copy = useCallback(async () => {
    if (!code) {
      toast.error(t("friends.friendCodeUnavailable"));
      return;
    }

    if (!(await copyToClipboard(code))) return;
    toast(t("common.copied"));
  }, [code, t]);

  const reset = useCallback(async () => {
    if (!accessToken || !authData?.sub) return;

    setIsResetting(true);
    const user = await api.backend.resetFriendCode(accessToken, authData.sub);
    setIsResetting(false);

    if (!user?.friendCode) {
      showFailureToast(t("friends.friendCodeSaveError"), undefined, {
        channels: ["backend:resetFriendCode"],
      });
      return;
    }

    setCode(user.friendCode);
    setIsEnabled(user.friendRequestsEnabled !== false);
    toast.success(t("friends.friendCodeReset"));
  }, [accessToken, authData?.sub, t]);

  const setRequestsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!accessToken || !authData?.sub) return;

      setIsEnabled(enabled);
      const user = await api.backend.updateFriendSettings(
        accessToken,
        authData.sub,
        { friendRequestsEnabled: enabled },
      );

      if (!user) {
        setIsEnabled(!enabled);
        showFailureToast(t("friends.friendCodeSaveError"), undefined, {
          channels: ["backend:updateFriendSettings", "backend:"],
        });
        return;
      }

      setIsEnabled(user.friendRequestsEnabled !== false);
    },
    [accessToken, authData?.sub, t],
  );

  return {
    code,
    isEnabled,
    isLoading,
    isResetting,
    copy,
    reset,
    setRequestsEnabled,
  };
}
