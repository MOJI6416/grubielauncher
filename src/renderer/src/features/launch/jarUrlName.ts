import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import type { Version } from "@renderer/classes/Version";
import { isProfileLoader } from "@/shared/profileLoaders";
import { accountAtom } from "@renderer/stores/atoms";
import { uiJournal } from "@renderer/utilities/journal";
import { openInstanceScreen } from "@renderer/features/instances/openInstanceScreen";
import { requestRenameOffer } from "@renderer/features/instances/renameOffer";
import { instanceKey } from "@renderer/features/instances/selectors";

export function resolvesRealJarPaths(loader: string | undefined): boolean {
  return isProfileLoader(loader) || loader === "bta-babric";
}

export function breaksJarUrlName(name: string): boolean {
  return name.endsWith("!");
}

export function jarUrlSafeName(name: string): string {
  return name.replace(/!+$/, "").trimEnd();
}

export function checkJarUrlName(version: Version): boolean {
  const name = version.version.name;
  const loader = version.version.loader.name;
  if (!resolvesRealJarPaths(loader) || !breaksJarUrlName(name)) return true;

  uiJournal.warn("launch", "instance name ends with ! and breaks jar URLs", {
    versionName: name,
    loader,
  });

  const t = i18n.t.bind(i18n);
  toast.error(t("app.jarUrlNameTitle"), {
    description: t("app.jarUrlNameHint"),
    duration: 30000,
    action: {
      label: t("common.rename"),
      onClick: () => {
        requestRenameOffer(instanceKey(version), jarUrlSafeName(name));
        openInstanceScreen(version, getDefaultStore().get(accountAtom));
      },
    },
  });
  return false;
}
