import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { Version } from "@renderer/classes/Version";
import { versionsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import {
  reportIpcFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import { suggestInstanceName } from "@renderer/features/newInstance/nameValidation";
import { instanceKey } from "./selectors";

const api = window.api;

let isDuplicating = false;

export function isInstanceDuplicating(): boolean {
  return isDuplicating;
}

export function buildDuplicateName(
  sourceName: string,
  takenNames: string[],
): string {
  return suggestInstanceName(
    i18n.t("versions.copyName", { name: sourceName }),
    takenNames,
  );
}

export async function duplicateInstance(source: Version): Promise<void> {
  if (isDuplicating) return;

  const store = getDefaultStore();
  const t = i18n.t.bind(i18n);
  const sourceName = source.version.name;
  const targetName = buildDuplicateName(
    sourceName,
    store.get(versionsAtom).map((instance) => instance.version.name),
  );

  if (!targetName) {
    showFailureToast(t("versions.duplicateError"), null, {
      fallbackDescription: t("versions.duplicateErrorHint"),
    });
    return;
  }

  isDuplicating = true;
  const toastId = toast.loading(
    t("versions.duplicating", { name: sourceName }),
  );

  try {
    const conf = await api.version.duplicate(sourceName, targetName);

    if (!conf) {
      if (
        !reportIpcFailure(t("versions.duplicateError"), ["version:duplicate"], {
          toastId,
        })
      ) {
        showFailureToast(t("versions.duplicateError"), null, {
          toastId,
          fallbackDescription: t("versions.duplicateErrorHint"),
        });
      }
      return;
    }

    const instance = new Version(conf);
    await instance.init();

    store.set(versionsAtom, [...store.get(versionsAtom), instance]);

    toast.success(t("versions.duplicated", { name: conf.name }), {
      id: toastId,
      description: t("versions.duplicatedHint"),
    });

    navigate({ name: "instance", id: instanceKey(instance) });
  } catch (error) {
    showFailureToast(t("versions.duplicateError"), error, { toastId });
  } finally {
    isDuplicating = false;
  }
}
