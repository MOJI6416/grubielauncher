import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { readInstanceServers } from "./instanceServers";
import { UpdateSummary, serversLostBySync } from "./updateSummary";

export function useSyncGuard({
  versionPath,
  isDownloaded,
  summary,
  onSync,
}: {
  versionPath?: string;
  isDownloaded?: boolean;
  summary?: UpdateSummary;
  onSync: () => void;
}): { requestSync: () => Promise<void>; confirmation: ReactNode } {
  const { t } = useTranslation();
  const [lost, setLost] = useState<string[]>([]);
  const [isUnknown, setIsUnknown] = useState(false);

  const close = () => {
    setLost([]);
    setIsUnknown(false);
  };

  return {
    requestSync: async () => {
      if (!isDownloaded || !summary || !versionPath) {
        onSync();
        return;
      }

      const stored = await readInstanceServers(versionPath);
      if (!stored) {
        setIsUnknown(true);
        return;
      }

      const names = serversLostBySync(stored, summary.remoteServers);
      if (names.length === 0) {
        onSync();
        return;
      }

      setLost(names);
    },
    confirmation:
      lost.length > 0 || isUnknown ? (
        <Confirmation
          title={t("versions.syncServers.title")}
          reversible={false}
          content={[
            {
              text: isUnknown
                ? t("versions.syncServers.unknownHint")
                : t("versions.syncServers.hint"),
              color: "warning",
            },
          ]}
          onClose={close}
          buttons={[
            {
              text: t("common.cancel"),
              onClick: close,
            },
            {
              text: t("versions.synchronize"),
              color: "danger",
              onClick: () => {
                close();
                onSync();
              },
            },
          ]}
        >
          {lost.length > 0 ? (
            <ul className="grid gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2">
              {lost.map((name) => (
                <li key={name} className="truncate text-xs text-foreground">
                  {name}
                </li>
              ))}
            </ul>
          ) : null}
        </Confirmation>
      ) : null,
  };
}
