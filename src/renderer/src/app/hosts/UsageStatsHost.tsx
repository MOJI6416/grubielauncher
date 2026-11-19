import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import type { Route } from "@renderer/navigation/routes";
import { currentRouteAtom } from "@renderer/navigation/store";
import { settingsAtom } from "@renderer/stores/atoms";
import { countFeature, routeUsage } from "@renderer/features/usage/usage";

const api = window.api;

export function UsageStatsHost() {
  const route = useAtomValue(currentRouteAtom);
  const settings = useAtomValue(settingsAtom);
  const previous = useRef<Route | null>(null);
  const isLoaded = settings !== DEFAULT_SETTINGS;
  const instanceTab = settings.interface.instanceTab;

  useEffect(() => {
    if (!isLoaded) return;
    const features = routeUsage(previous.current, route, instanceTab);
    previous.current = route;
    features.forEach(countFeature);
  }, [instanceTab, isLoaded, route]);

  useEffect(() => {
    if (isLoaded && !settings.usageStats) api.usage.clear();
  }, [isLoaded, settings.usageStats]);

  return null;
}
