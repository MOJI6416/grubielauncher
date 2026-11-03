import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import {
  changeUiScale,
  readUiScaleShortcut,
} from "@renderer/features/settings/uiScale";

const api = window.api;

const WHEEL_STEP = 100;
const WHEEL_IDLE_MS = 300;

export function UiScaleHost() {
  const settings = useAtomValue(settingsAtom);
  const isLoaded = settings !== DEFAULT_SETTINGS;

  useEffect(() => {
    if (isLoaded) void api.other.setUiScale(settings.uiScale);
  }, [isLoaded, settings.uiScale]);

  useEffect(() => {
    if (!isLoaded) return;

    let wheelDelta = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const shortcut = readUiScaleShortcut(event);
      if (!shortcut) return;

      event.preventDefault();
      if (!event.repeat || shortcut !== "reset") void changeUiScale(shortcut);
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.defaultPrevented) return;
      event.preventDefault();

      wheelDelta += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelDelta = 0;
      }, WHEEL_IDLE_MS);

      if (Math.abs(wheelDelta) < WHEEL_STEP) return;
      const direction = wheelDelta < 0 ? "in" : "out";
      wheelDelta = 0;
      void changeUiScale(direction);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, [isLoaded]);

  return null;
}
