import { getDefaultStore, useAtomValue } from "jotai";
import i18n from "@renderer/i18n";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import { layoutEditingAtom } from "@renderer/features/layout/useLayout";

export function useSidebarCollapsed(): boolean {
  const collapsed = useAtomValue(settingsAtom).sidebarCollapsed;
  const editing = useAtomValue(layoutEditingAtom);
  return collapsed && !editing;
}

export function toggleSidebar(): void {
  const collapsed = getDefaultStore().get(settingsAtom).sidebarCollapsed;
  void patchSettings({ sidebarCollapsed: !collapsed }).catch((error) =>
    showFailureToast(i18n.t("settings.saveFailed"), error, {
      channels: ["fs:writeJSON"],
    }),
  );
}
