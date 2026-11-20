import type { InstanceTab } from "@renderer/navigation/routes";

export interface InstanceTabItem {
  id: InstanceTab;
  count?: number;
  alert?: boolean;
}

export interface InstanceTabsInput {
  contentCount: number;
  worldCount: number;
  serverCount: number;
  hasConfigs: boolean;
  isModded?: boolean;
  hasStatistics: boolean;
  hasServerManager: boolean;
  hasOwnServer: boolean;
  canCreateServer?: boolean;
  hasUnsavedSettings?: boolean;
  hasUnsavedArguments?: boolean;
  hasModpack?: boolean;
  hasModpackUpdate?: boolean;
  hasBisect?: boolean;
  isBisectActive?: boolean;
}

export function buildInstanceTabs(input: InstanceTabsInput): InstanceTabItem[] {
  const tabs: InstanceTabItem[] = [
    { id: "overview" },
    ...(input.hasModpack
      ? [{ id: "modpack" as const, alert: input.hasModpackUpdate === true }]
      : []),
    { id: "content", count: input.contentCount },
  ];

  if (input.hasBisect)
    tabs.push({ id: "bisect", alert: input.isBisectActive === true });

  tabs.push({ id: "worlds", count: input.worldCount });
  if (input.hasServerManager) {
    tabs.push({ id: "servers", count: input.serverCount });
  }
  if (input.hasOwnServer || input.canCreateServer) tabs.push({ id: "server" });
  if (input.hasConfigs || input.isModded) tabs.push({ id: "configs" });

  tabs.push({ id: "settings", alert: input.hasUnsavedSettings === true });
  tabs.push({ id: "arguments", alert: input.hasUnsavedArguments === true });

  if (input.hasStatistics) tabs.push({ id: "statistics" });

  tabs.push({ id: "logs" });

  return tabs;
}

export function resolveActiveTab(
  tabs: InstanceTabItem[],
  requested: InstanceTab | undefined,
): InstanceTab {
  if (requested && tabs.some((tab) => tab.id === requested)) return requested;
  return "overview";
}

export function fitTabs(
  widths: number[],
  activeIndex: number,
  available: number,
  moreWidth: number,
): number[] {
  const all = widths.map((_, index) => index);
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= available) return all;

  const room = available - moreWidth;
  const shown: number[] = [];
  let used = 0;
  for (const index of all) {
    if (used + widths[index] > room) break;
    shown.push(index);
    used += widths[index];
  }

  if (activeIndex < 0 || activeIndex >= widths.length) return shown;
  if (shown.includes(activeIndex)) return shown;

  while (shown.length > 0 && used + widths[activeIndex] > room) {
    const last = shown.pop();
    if (last === undefined) break;
    used -= widths[last];
  }
  return [...shown, activeIndex];
}
