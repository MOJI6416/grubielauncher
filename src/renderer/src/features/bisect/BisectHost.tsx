import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getDefaultStore, useAtomValue } from "jotai";
import { toast } from "sonner";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import {
  settingsAtom,
  versionsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { instanceKey } from "@renderer/features/instances/selectors";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { loadActiveBisects } from "./bisectStore";

export function BisectHost() {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const isDone = useRef(false);

  useEffect(() => {
    if (isDone.current) return;
    if (settings === DEFAULT_SETTINGS || !versionsLoaded) return;
    isDone.current = true;
    const versions = getDefaultStore().get(versionsAtom);
    void loadActiveBisects(versions.map((version) => version.versionPath))
      .then((active) => {
        for (const versionPath of active) {
          const instance = getDefaultStore()
            .get(versionsAtom)
            .find((version) => version.versionPath === versionPath);
          if (!instance) continue;
          toast.info(t("bisect.reminder", { name: instance.version.name }), {
            description: t("bisect.reminderHint"),
            duration: 20000,
            action: {
              label: t("bisect.continue"),
              onClick: () =>
                navigate({
                  name: "instance",
                  id: instanceKey(instance),
                  tab: "bisect",
                }),
            },
          });
        }
      })
      .catch(ignoreFailure);
  }, [settings, t, versionsLoaded]);

  return null;
}
