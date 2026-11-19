import { atom, getDefaultStore, useAtomValue } from "jotai";
import i18n from "@renderer/i18n";
import {
  DEFAULT_INTERFACE_LAYOUT,
  type InterfaceLayout,
} from "@/types/Settings";
import { setDockHidden, setInstancePinned } from "@/shared/instancesFile";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";
import { updateInstancesFile } from "@renderer/features/instances/instancesStore";
import { countFeature } from "@renderer/features/usage/usage";
import { setSlotHidden } from "./layout";
import {
  currentPresetValues,
  presetValues,
  type LayoutPresetId,
  type PresetValues,
} from "./presets";

export const layoutEditingAtom = atom(false);
const layoutSnapshotAtom = atom<InterfaceLayout | null>(null);

export function useLayout(): InterfaceLayout {
  return useAtomValue(settingsAtom).interface;
}

export function useLayoutEditing(): boolean {
  return useAtomValue(layoutEditingAtom);
}

function saveLayout(next: InterfaceLayout): void {
  void patchSettings({ interface: next }).catch((error) =>
    showFailureToast(i18n.t("settings.saveFailed"), error, {
      channels: ["fs:writeJSON"],
    }),
  );
}

export function updateLayout(
  update: (layout: InterfaceLayout) => InterfaceLayout,
): void {
  saveLayout(update(getDefaultStore().get(settingsAtom).interface));
}

export function toggleSlot(id: string, hidden: boolean): void {
  updateLayout((layout) => setSlotHidden(layout, id, hidden));
}

export function resetLayout(): void {
  const previous = getDefaultStore().get(settingsAtom).interface;
  saveLayout(DEFAULT_INTERFACE_LAYOUT);
  showUndoToast(i18n.t("layout.resetDone"), () => saveLayout(previous), {
    id: "layout-reset",
  });
}

export function startLayoutEditing(): void {
  const store = getDefaultStore();
  if (store.get(layoutEditingAtom)) return;
  store.set(layoutSnapshotAtom, store.get(settingsAtom).interface);
  store.set(layoutEditingAtom, true);
  countFeature("feature.layoutEdit");
}

export function finishLayoutEditing(): void {
  const store = getDefaultStore();
  store.set(layoutEditingAtom, false);
  store.set(layoutSnapshotAtom, null);
}

export function cancelLayoutEditing(): void {
  const store = getDefaultStore();
  const snapshot = store.get(layoutSnapshotAtom);
  finishLayoutEditing();
  if (snapshot) saveLayout(snapshot);
}

export function pinInDock(key: string, pinned: boolean): void {
  updateInstancesFile((file) => setInstancePinned(file, key, pinned));
}

export function hideFromDock(key: string, hidden: boolean): void {
  updateInstancesFile((file) => setDockHidden(file, key, hidden));
}

function savePreset(values: PresetValues): Promise<boolean> {
  return patchSettings(values).then(
    () => true,
    (error) => {
      showFailureToast(i18n.t("settings.saveFailed"), error, {
        channels: ["fs:writeJSON"],
      });
      return false;
    },
  );
}

export function applyPreset(id: LayoutPresetId): void {
  const previous = currentPresetValues(getDefaultStore().get(settingsAtom));
  void savePreset(presetValues(id)).then(
    (saved) =>
      saved &&
      showUndoToast(
        i18n.t("layout.presets.applied", {
          name: i18n.t(`layout.presets.${id}.title`),
        }),
        () => void savePreset(previous),
        { id: "layout-preset" },
      ),
  );
}
