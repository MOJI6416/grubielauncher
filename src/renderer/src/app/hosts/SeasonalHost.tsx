import { useEffect } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { settingsAtom } from "@renderer/stores/atoms";
import {
  activeSeasonalEvent,
  sameActiveEvent,
} from "@renderer/features/seasonal/calendar";
import { seasonalEventAtom } from "@renderer/features/seasonal/seasonalStore";

const RECHECK_MS = 10 * 60_000;

export function SeasonalHost() {
  const settings = useAtomValue(settingsAtom);
  const event = useAtomValue(seasonalEventAtom);
  const isLoaded = settings !== DEFAULT_SETTINGS;
  const enabled = isLoaded && settings.seasonalDecor;

  useEffect(() => {
    const store = getDefaultStore();
    const update = () => {
      const next = enabled ? activeSeasonalEvent(new Date()) : null;
      if (!sameActiveEvent(store.get(seasonalEventAtom), next)) {
        store.set(seasonalEventAtom, next);
      }
    };

    update();
    if (!enabled) return;

    const timer = window.setInterval(update, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    const root = document.documentElement;
    if (event) root.dataset.season = event.id;
    else delete root.dataset.season;
  }, [event]);

  return null;
}
