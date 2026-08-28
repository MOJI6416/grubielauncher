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
  hasSaves: boolean;
  hasConfigs: boolean;
  hasStatistics: boolean;
  hasServerManager: boolean;
  hasOwnServer: boolean;
  hasUnsavedContent?: boolean;
}

export function buildInstanceTabs(input: InstanceTabsInput): InstanceTabItem[] {
  const tabs: InstanceTabItem[] = [
    { id: "overview" },
    {
      id: "content",
      count: input.contentCount,
      alert: input.hasUnsavedContent === true,
    },
  ];

  if (input.hasSaves) tabs.push({ id: "worlds", count: input.worldCount });
  if (input.hasServerManager) {
    tabs.push({ id: "servers", count: input.serverCount });
  }
  if (input.hasOwnServer) tabs.push({ id: "server" });
  if (input.hasConfigs) tabs.push({ id: "configs" });

  tabs.push({ id: "settings" });

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
