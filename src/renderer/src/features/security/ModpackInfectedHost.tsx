import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getDefaultStore, useAtomValue } from "jotai";
import { toast } from "sonner";
import { friendSocketAtom, versionsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { instanceKey } from "@renderer/features/instances/selectors";
import { playSound } from "@renderer/utilities/sounds";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

export interface ModpackInfectedNotice {
  modpackId: string;
  shareCode: string;
  name: string;
  files: { file: string; threats: string[] }[];
}

export function toModpackInfectedNotice(
  payload: unknown,
): ModpackInfectedNotice | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.modpackId !== "string" || !raw.modpackId) return null;
  const files = Array.isArray(raw.files)
    ? raw.files
        .filter(
          (item): item is { file: string; threats?: unknown } =>
            !!item && typeof (item as { file?: unknown }).file === "string",
        )
        .slice(0, 50)
        .map((item) => ({
          file: item.file.slice(0, 200),
          threats: Array.isArray(item.threats)
            ? item.threats
                .filter((threat): threat is string => typeof threat === "string")
                .slice(0, 10)
            : [],
        }))
    : [];
  return {
    modpackId: raw.modpackId.slice(0, 64),
    shareCode:
      typeof raw.shareCode === "string" ? raw.shareCode.slice(0, 64) : "",
    name: typeof raw.name === "string" ? raw.name.slice(0, 120) : "",
    files,
  };
}

export function ModpackInfectedHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const friendSocket = useAtomValue(friendSocketAtom);

  useEffect(() => {
    const onInfected = (payload: unknown) => {
      const notice = toModpackInfectedNotice(payload);
      if (!notice) return;
      const instance = getDefaultStore()
        .get(versionsAtom)
        .find(
          (version) =>
            !!version.version.shareCode &&
            (version.version.shareCode === notice.shareCode ||
              version.version.shareCode === notice.modpackId),
        );
      const name = notice.name || instance?.version.name || "";
      playSound("error");
      toast.error(tRef.current("modpackScan.unlisted", { name }), {
        id: `modpack-infected-${notice.modpackId}`,
        description: tRef.current("modpackScan.unlistedHint", {
          files: notice.files.map((item) => item.file).join(", "),
          count: notice.files.length,
        }),
        duration: 60000,
        ...(instance
          ? {
              action: {
                label: tRef.current("modpackScan.open"),
                onClick: () =>
                  navigate({ name: "instance", id: instanceKey(instance) }),
              },
            }
          : {}),
      });
    };

    friendSocket?.on("modpackInfected", onInfected);
    return () => {
      friendSocket?.off("modpackInfected", onInfected);
    };
  }, [friendSocket, tRef]);

  return null;
}
