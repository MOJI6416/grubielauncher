import { atom, getDefaultStore } from "jotai";
import {
  EMPTY_INSTANCES_FILE,
  InstancesFile,
  mergeLegacyOrganize,
  normalizeInstancesFile,
} from "@/shared/instancesFile";
import i18n from "@renderer/i18n";
import { loadManualOrder, loadVersionTags } from "@renderer/utilities/versionOrganize";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

const FILE_NAME = "instances.json";

export const instancesFileAtom = atom<InstancesFile>(EMPTY_INSTANCES_FILE);

export const instancesFileUnreadableAtom = atom(false);

let filePath: string | null = null;
let isFileReadable = false;

export async function hydrateInstancesFile(launcherPath: string): Promise<void> {
  if (!launcherPath) return;

  const store = getDefaultStore();
  filePath = await api.path.join(launcherPath, FILE_NAME);
  isFileReadable = true;

  let loaded = EMPTY_INSTANCES_FILE;
  try {
    if (await api.fs.pathExists(filePath)) {
      const raw = await api.fs.readJSON<unknown>(filePath, "utf-8");
      if (raw === null || raw === undefined) throw new Error(FILE_NAME);

      loaded = normalizeInstancesFile(raw);
    }
  } catch (error) {
    isFileReadable = false;
    loaded = EMPTY_INSTANCES_FILE;

    showFailureToast(i18n.t("versions.organizeLoadFailed"), error, {
      channels: ["fs:readJSON"],
      toastId: "instances-file-read",
      fallbackDescription: i18n.t("versions.organizeLoadFailedHint"),
    });
  }

  const merged = mergeLegacyOrganize(loaded, {
    tags: loadVersionTags(),
    order: loadManualOrder(),
  });

  store.set(instancesFileAtom, merged);
  store.set(instancesFileUnreadableAtom, !isFileReadable);

  if (isFileReadable && JSON.stringify(merged) !== JSON.stringify(loaded)) {
    writeFile(merged);
  }
}

function writeFile(file: InstancesFile): boolean {
  if (!filePath || !isFileReadable) {
    showErrorToast(
      i18n.t("versions.organizeSaveFailed"),
      i18n.t("versions.organizeLoadFailedHint"),
      i18n.t("common.copy"),
      "instances-file-write",
    );
    return false;
  }

  const error = api.fs.writeJSONSync(filePath, file);
  if (!error) return true;

  showFailureToast(i18n.t("versions.organizeSaveFailed"), error, {
    toastId: "instances-file-write",
  });
  return false;
}

export function updateInstancesFile(
  update: (file: InstancesFile) => InstancesFile,
): void {
  const store = getDefaultStore();
  const previous = store.get(instancesFileAtom);
  const next = update(previous);
  if (next === previous) return;

  store.set(instancesFileAtom, next);
  if (!writeFile(next)) store.set(instancesFileAtom, previous);
}

export const instanceTagsAtom = atom(
  (get) => get(instancesFileAtom).tags,
);

export const instanceOrderAtom = atom(
  (get) => get(instancesFileAtom).order,
);

export const instanceGroupsAtom = atom(
  (get) => get(instancesFileAtom).groups,
);

export const ungroupedCollapsedAtom = atom(
  (get) => get(instancesFileAtom).ungroupedCollapsed === true,
);
