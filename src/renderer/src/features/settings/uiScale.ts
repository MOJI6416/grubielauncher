import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  DEFAULT_UI_SCALE,
  formatUiScale,
  stepUiScale,
} from "@/shared/uiScale";

const api = window.api;

const TOAST_ID = "ui-scale";

export type UiScaleShortcut = "in" | "out" | "reset";

export function readUiScaleShortcut(event: KeyboardEvent): UiScaleShortcut | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;

  switch (event.code) {
    case "Equal":
    case "NumpadAdd":
      return "in";
    case "Minus":
    case "NumpadSubtract":
      return "out";
    case "Digit0":
    case "Numpad0":
      return "reset";
    default:
      return null;
  }
}

function announce(scale: number): void {
  toast(i18n.t("settings.interface.uiScaleToast", { value: formatUiScale(scale) }), {
    id: TOAST_ID,
    action:
      scale === DEFAULT_UI_SCALE
        ? undefined
        : {
            label: i18n.t("common.reset"),
            onClick: () => void changeUiScale("reset"),
          },
  });
}

async function commitUiScale(scale: number): Promise<void> {
  try {
    await patchSettings({ uiScale: scale });
  } catch (error) {
    showFailureToast(i18n.t("settings.saveFailed"), error, {
      channels: ["fs:writeJSON"],
    });
  }
}

export async function changeUiScale(shortcut: UiScaleShortcut): Promise<void> {
  const current = getDefaultStore().get(settingsAtom).uiScale;
  const state = await api.other.getUiScale();
  const next =
    shortcut === "reset"
      ? DEFAULT_UI_SCALE
      : stepUiScale(current, shortcut === "in" ? 1 : -1, state.options);

  if (next !== current) await commitUiScale(next);
  announce(next);
}
