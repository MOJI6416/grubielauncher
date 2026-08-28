import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { cancelActiveInstall } from "@renderer/features/install/installActions";
import { installProgressAtom } from "@renderer/features/install/installUi";
import {
  isNavigationBlocked,
  subscribeNavigationBlockers,
} from "@renderer/navigation/guards";

const api = window.api;

type CloseReason = { unsaved: boolean; servers: boolean; install: boolean };

export function UnsavedCloseHost() {
  const { t } = useTranslation();
  const [reason, setReason] = useState<CloseReason | null>(null);
  const progress = useAtomValue(installProgressAtom);

  useEffect(() => {
    const push = () => void api.other.setUnsavedGuard(isNavigationBlocked());

    push();

    return subscribeNavigationBlockers(push);
  }, []);

  useEffect(() => {
    return api.other.onCloseRequested((next) => setReason(next));
  }, []);

  if (!reason) return null;

  const installHint = progress?.versionName
    ? t("taskCenter.closeHintNamed", { name: progress.versionName })
    : t("taskCenter.closeHint");

  if (reason.servers) {
    return (
      <Confirmation
        title={t("serverManager.closeTitle")}
        content={[
          { text: t("serverManager.closeHint"), color: "warning" },
          ...(reason.install
            ? [{ text: installHint, color: "warning" as const }]
            : []),
          ...(reason.unsaved ? [{ text: t("versions.notSavedHint") }] : []),
        ]}
        onClose={() => setReason(null)}
        buttons={[
          {
            text: t("versions.willReturn"),
            color: "secondary",
            onClick: async () => setReason(null),
          },
          {
            color: "danger",
            text: t("serverManager.closeStopAndQuit"),
            onClick: async () => {
              if (reason.install) await cancelActiveInstall();
              await api.server.stopAll();
              setReason(null);
              await api.other.confirmClose();
            },
          },
        ]}
      />
    );
  }

  if (reason.install) {
    return (
      <Confirmation
        title={t("taskCenter.closeTitle")}
        reversible={false}
        content={[
          { text: installHint, color: "warning" },
          ...(reason.unsaved ? [{ text: t("versions.notSavedHint") }] : []),
        ]}
        onClose={() => setReason(null)}
        buttons={[
          {
            text: t("versions.willReturn"),
            color: "secondary",
            onClick: async () => setReason(null),
          },
          {
            color: "danger",
            text: t("taskCenter.closeStopAndQuit"),
            onClick: async () => {
              await cancelActiveInstall();
              setReason(null);
              await api.other.confirmClose();
            },
          },
        ]}
      />
    );
  }

  return (
    <Confirmation
      content={[{ text: t("versions.notSavedHint"), color: "warning" }]}
      onClose={() => setReason(null)}
      title={t("versions.notSavedTitle")}
      reversible={false}
      buttons={[
        {
          text: t("versions.willReturn"),
          color: "secondary",
          onClick: async () => setReason(null),
        },
        {
          color: "danger",
          text: t("versions.closeAnyway"),
          onClick: async () => {
            setReason(null);
            await api.other.confirmClose();
          },
        },
      ]}
    />
  );
}
