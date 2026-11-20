import { atom, getDefaultStore, useAtomValue } from "jotai";
import i18n from "@renderer/i18n";
import {
  DEFAULT_INTERFACE_LAYOUT,
  type InterfaceLayout,
} from "@/types/Settings";
import { setDockHidden, setInstancePinned, withDockLists } from "@/shared/instancesFile";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";
import {
  instancesFileAtom,
  updateInstancesFile,
} from "@renderer/features/instances/instancesStore";
import { countFeature } from "@renderer/features/usage/usage";
import { moveNav, setSlotHidden, type NavSlot } from "./layout";
import {
  currentPresetValues,
  presetValues,
  type LayoutPresetId,
  type PresetValues,
} from "./presets";

interface EditSnapshot {
  layout: InterfaceLayout;
  pinned: string[];
  dockHidden: string[];
}

export const layoutEditingAtom = atom(false);
const layoutSnapshotAtom = atom<EditSnapshot | null>(null);

const HIDDEN_TOAST = "layout-hidden";
const RESET_TOAST = "layout-reset";

export function useLayout(): InterfaceLayout {
  return useAtomValue(settingsAtom).interface;
}

export function useLayoutEditing(): boolean {
  return useAtomValue(layoutEditingAtom);
}

function currentLayout(): InterfaceLayout {
  return getDefaultStore().get(settingsAtom).interface;
}

function saveLayout(next: InterfaceLayout): void {
  void patchSettings({ interface: next }).catch((error) =>
    showFailureToast(i18n.t("settings.saveFailed"), error, {
      channels: ["fs:writeJSON"],
    }),
  );
}

function restoreToast(title: string, onRestore: () => void, id: string): void {
  showUndoToast(title, onRestore, { id, actionLabel: i18n.t("layout.restore") });
}

export function updateLayout(
  update: (layout: InterfaceLayout) => InterfaceLayout,
): void {
  saveLayout(update(currentLayout()));
}

export function moveNavSlot(slot: NavSlot, delta: number): void {
  updateLayout((layout) => moveNav(layout, slot, delta));
}

export function setSlotVisible(id: string, label: string, visible: boolean): void {
  updateLayout((layout) => setSlotHidden(layout, id, !visible));
  if (visible) return;
  restoreToast(
    i18n.t("layout.hiddenDone", { name: label }),
    () => updateLayout((layout) => setSlotHidden(layout, id, false)),
    HIDDEN_TOAST,
  );
}

export function resetLayoutPart(
  label: string,
  update: (layout: InterfaceLayout) => InterfaceLayout,
): void {
  const previous = currentLayout();
  saveLayout(update(previous));
  restoreToast(
    i18n.t("layout.resetPart", { name: label }),
    () => saveLayout(previous),
    RESET_TOAST,
  );
}

export function resetLayout(): void {
  const previous = currentLayout();
  saveLayout(DEFAULT_INTERFACE_LAYOUT);
  restoreToast(i18n.t("layout.resetDone"), () => saveLayout(previous), RESET_TOAST);
}

function dockLists(): { pinned: string[]; dockHidden: string[] } {
  const file = getDefaultStore().get(instancesFileAtom);
  return { pinned: file.pinned ?? [], dockHidden: file.dockHidden ?? [] };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function restoreDock(pinned: string[], dockHidden: string[]): void {
  const current = dockLists();
  if (sameList(current.pinned, pinned) && sameList(current.dockHidden, dockHidden)) return;
  updateInstancesFile((file) => withDockLists(file, pinned, dockHidden));
}

export function startLayoutEditing(): void {
  const store = getDefaultStore();
  if (store.get(layoutEditingAtom)) return;
  store.set(layoutSnapshotAtom, { layout: currentLayout(), ...dockLists() });
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
  if (!snapshot) return;
  if (JSON.stringify(snapshot.layout) !== JSON.stringify(currentLayout())) {
    saveLayout(snapshot.layout);
  }
  restoreDock(snapshot.pinned, snapshot.dockHidden);
}

export function pinInDock(key: string, pinned: boolean): void {
  updateInstancesFile((file) => setInstancePinned(file, key, pinned));
}

export function setDockVisible(key: string, name: string, visible: boolean): void {
  updateInstancesFile((file) => setDockHidden(file, key, !visible));
  if (visible) return;
  restoreToast(
    i18n.t("layout.hiddenDone", { name }),
    () => updateInstancesFile((file) => setDockHidden(file, key, false)),
    HIDDEN_TOAST,
  );
}

export function showWholeDock(): void {
  const { pinned, dockHidden } = dockLists();
  if (dockHidden.length === 0) return;
  updateInstancesFile((file) => withDockLists(file, pinned, []));
  showUndoToast(
    i18n.t("layout.dock.shownAll"),
    () => restoreDock(dockLists().pinned, dockHidden),
    { id: RESET_TOAST },
  );
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
