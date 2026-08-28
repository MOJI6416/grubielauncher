import { useCallback, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { IModpack } from "@/types/Backend";
import { accountAtom } from "@renderer/stores/atoms";
import {
  reportIpcFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import { withPackRequestTimeout } from "@renderer/utilities/packShare";

const api = window.api;

export function usePackInstall(onResolved: (modpack: IModpack) => void) {
  const { t } = useTranslation();
  const account = useAtomValue(accountAtom);
  const [busyId, setBusyId] = useState<string | null>(null);

  const install = useCallback(
    async (id: string) => {
      setBusyId(id);

      try {
        const response = await withPackRequestTimeout(
          api.backend.getModpack(account?.accessToken || "", id),
        );

        if (response.data) {
          onResolved(response.data);
          return;
        }

        if (
          !reportIpcFailure(t("addVersion.fromServer.loadError"), [
            "backend:getModpack",
          ])
        ) {
          toast.error(t("addVersion.fromServer.notFound"));
        }
      } catch (error) {
        showFailureToast(t("addVersion.fromServer.loadError"), error, {
          fallbackDescription: t("addVersion.fromServer.timeoutHint"),
        });
      } finally {
        setBusyId(null);
      }
    },
    [account?.accessToken, onResolved, t],
  );

  return { busyId, install };
}
