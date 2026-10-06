import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import type { Version } from "@renderer/classes/Version";
import {
  type OrnitheModsCheck,
  ornitheLoaderVersionId,
  splitOrnitheGeneration,
} from "@/shared/profileLoaders";
import { accountAtom, settingsAtom } from "@renderer/stores/atoms";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { showFailureToast } from "@renderer/utilities/failures";
import { uiJournal } from "@renderer/utilities/journal";
import { localizeLoaderChangeError } from "@renderer/utilities/version";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";

const LISTED_MODS = 4;

export function formatModList(names: string[]): string {
  const listed = names.slice(0, LISTED_MODS).join(", ");
  const rest = names.length - LISTED_MODS;
  return rest > 0
    ? i18n.t("loaderUpdate.ornithe.more", { list: listed, count: rest })
    : listed;
}

export function ornitheSwitchTarget(
  currentId: string,
  generation: number,
): string {
  return ornitheLoaderVersionId(
    splitOrnitheGeneration(currentId).version,
    generation,
  );
}

export async function checkOrnitheGeneration(
  version: Version,
  relaunch: () => void,
): Promise<boolean> {
  if (version.version.loader.name !== "ornithe") return true;

  const currentId = version.version.loader.version?.id;
  const check = await window.api.version
    .checkOrnitheMods(version.versionPath, version.version.version.id)
    .catch(() => null);
  if (!currentId || !check?.target) return true;

  uiJournal.warn("launch", "mods built for another Ornithe generation", {
    generation: check.generation,
    target: check.target,
    mismatched: check.mismatched,
    compatible: check.compatible.length,
  });

  reportMismatch(version, currentId, check, relaunch);
  return false;
}

function reportMismatch(
  version: Version,
  currentId: string,
  check: OrnitheModsCheck,
  relaunch: () => void,
) {
  const t = i18n.t.bind(i18n);
  const params = {
    mods: formatModList(check.mismatched),
    generation: check.target,
    current: check.generation,
  };

  if (check.compatible.length > 0 || check.target === null) {
    showErrorToast(
      t("loaderUpdate.ornithe.mixedTitle"),
      t("loaderUpdate.ornithe.mixedHint", params),
      t("common.copy"),
    );
    return;
  }

  const targetId = ornitheSwitchTarget(currentId, check.target);
  toast.error(t("loaderUpdate.ornithe.title"), {
    description: t("loaderUpdate.ornithe.switchHint", params),
    duration: 30000,
    action: {
      label: t("loaderUpdate.ornithe.switchAction", params),
      onClick: () => void switchGeneration(version, targetId, relaunch),
    },
  });
}

async function switchGeneration(
  version: Version,
  targetId: string,
  relaunch: () => void,
) {
  const store = getDefaultStore();
  const account = store.get(accountAtom);
  const settings = store.get(settingsAtom);
  if (!account || !settings) return;

  const t = i18n.t.bind(i18n);
  const toastId = toast.loading(
    t("loaderUpdate.ornithe.switching", { version: targetId }),
  );

  try {
    const next = await version.changeLoader(account, settings, targetId);
    bumpInstanceDataRevision();
    toast.success(t("loaderUpdate.done", { version: next.id }), {
      id: toastId,
    });
    relaunch();
  } catch (error) {
    toast.dismiss(toastId);
    showFailureToast(
      t("loaderUpdate.failed"),
      localizeLoaderChangeError(error),
    );
  }
}
