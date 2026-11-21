import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { settingsAtom } from "@renderer/stores/atoms";
import { goBack } from "@renderer/navigation/navigate";
import { countFeature } from "@renderer/features/usage/usage";
import {
  GamepadReader,
  snapshotPads,
  type GamepadAction,
} from "@renderer/features/gamepad/gamepadInput";
import {
  activateFocus,
  dismissLayer,
  moveFocus,
  openContextMenu,
  scrollBy,
  scrollPage,
  switchTab,
  topLayer,
} from "@renderer/features/gamepad/gamepadNav";
import { emitGamepadPress } from "@renderer/features/gamepad/gamepadEvents";
import {
  currentInstance,
  playInstance,
} from "@renderer/features/gamepad/playCurrent";
import {
  isBigModeOpen,
  openBigMode,
  toggleBigMode,
} from "@renderer/features/bigMode/bigModeStore";

const SCROLL_SPEED = 22;
const HINT_KEY = "grubie:gamepadHintShown";
const INPUT_ATTRIBUTE = "data-input";

function markGamepadInput(): void {
  document.documentElement.setAttribute(INPUT_ATTRIBUTE, "gamepad");
}

function clearGamepadInput(): void {
  document.documentElement.removeAttribute(INPUT_ATTRIBUTE);
}

function offerBigMode(): void {
  try {
    if (localStorage.getItem(HINT_KEY)) return;
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    return;
  }
  if (isBigModeOpen()) return;
  toast(i18n.t("gamepad.connected"), {
    id: "gamepad-connected",
    description: i18n.t("gamepad.connectedDescription"),
    action: {
      label: i18n.t("bigMode.name"),
      onClick: () => openBigMode(),
    },
  });
}

function isEditing(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.matches("input, textarea, select") || active.isContentEditable)
  );
}

function back(): void {
  if (dismissLayer()) return;
  if (isEditing()) {
    (document.activeElement as HTMLElement).blur();
    return;
  }
  goBack();
}

function perform(action: GamepadAction): void {
  if (action.type === "move") {
    moveFocus(action.direction);
    return;
  }

  if (emitGamepadPress(action.button)) return;

  switch (action.button) {
    case "a":
      activateFocus();
      return;
    case "b":
      back();
      return;
    case "x":
      openContextMenu();
      return;
    case "lb":
      switchTab(-1);
      return;
    case "rb":
      switchTab(1);
      return;
    case "lt":
      scrollPage(-1);
      return;
    case "rt":
      scrollPage(1);
      return;
    case "view":
      if (!topLayer()) toggleBigMode();
      return;
    case "start":
      if (!topLayer()) playInstance(currentInstance());
      return;
    default:
      return;
  }
}

export function GamepadHost() {
  const enabled = useAtomValue(settingsAtom).gamepad;

  useEffect(() => {
    if (!enabled) return;

    const reader = new GamepadReader();
    let frame = 0;
    let used = false;

    const hasPads = () =>
      [...navigator.getGamepads()].some((pad) => pad?.connected);

    const tick = () => {
      frame = 0;
      const pads = navigator.getGamepads();
      if (!document.hasFocus() || document.visibilityState !== "visible") {
        reader.reset();
      } else {
        const result = reader.read(snapshotPads([...pads]), performance.now());
        if (result.active) {
          markGamepadInput();
          if (!used) {
            used = true;
            countFeature("gamepad.use");
            offerBigMode();
          }
        }
        result.actions.forEach(perform);
        if (result.scroll !== 0) scrollBy(result.scroll * SCROLL_SPEED);
      }
      if (hasPads()) frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onPointer = () => clearGamepadInput();
    const onKey = (event: KeyboardEvent) => {
      if (event.isTrusted) clearGamepadInput();
    };

    window.addEventListener("gamepadconnected", start);
    window.addEventListener("mousemove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey, true);
    if (hasPads()) start();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("mousemove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      clearGamepadInput();
    };
  }, [enabled]);

  return null;
}
