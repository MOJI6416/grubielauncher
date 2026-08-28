import type { AgentRisk } from "@renderer/agent/types";

export type ToolGroupId =
  | "instances"
  | "content"
  | "worlds"
  | "diagnostics"
  | "skins"
  | "system"
  | "dialogue"
  | "other";

export type ToolNeed = "none" | "internet" | "account" | "both";

export type ToolDescriptor = {
  name: string;
  group: ToolGroupId;
  risk: AgentRisk;
  need: ToolNeed;
};

export type ToolSurfaceEntry = ToolDescriptor & { available: boolean };

export type ToolSurfaceGroup = {
  id: ToolGroupId;
  entries: ToolSurfaceEntry[];
  availableCount: number;
};

export const TOOL_GROUP_ORDER: ToolGroupId[] = [
  "instances",
  "content",
  "worlds",
  "diagnostics",
  "skins",
  "system",
  "dialogue",
  "other",
];

const CATALOG: ToolDescriptor[] = [
  { name: "list_instances", group: "instances", risk: "read", need: "none" },
  { name: "get_instance", group: "instances", risk: "read", need: "none" },
  { name: "create_instance", group: "instances", risk: "write", need: "both" },
  {
    name: "launch_instance",
    group: "instances",
    risk: "write",
    need: "account",
  },
  {
    name: "check_integrity",
    group: "instances",
    risk: "write",
    need: "account",
  },
  {
    name: "set_run_arguments",
    group: "instances",
    risk: "write",
    need: "none",
  },
  {
    name: "delete_instance",
    group: "instances",
    risk: "destructive",
    need: "none",
  },

  { name: "search_mods", group: "content", risk: "read", need: "internet" },
  { name: "get_project", group: "content", risk: "read", need: "internet" },
  {
    name: "get_project_versions",
    group: "content",
    risk: "read",
    need: "internet",
  },
  {
    name: "get_dependencies",
    group: "content",
    risk: "read",
    need: "internet",
  },
  {
    name: "list_minecraft_versions",
    group: "content",
    risk: "read",
    need: "internet",
  },
  {
    name: "list_loader_versions",
    group: "content",
    risk: "read",
    need: "internet",
  },
  { name: "add_mods", group: "content", risk: "write", need: "internet" },
  { name: "update_mods", group: "content", risk: "write", need: "internet" },
  { name: "remove_mods", group: "content", risk: "write", need: "none" },
  { name: "toggle_mods", group: "content", risk: "write", need: "none" },

  { name: "list_worlds", group: "worlds", risk: "read", need: "account" },
  {
    name: "list_world_backups",
    group: "worlds",
    risk: "read",
    need: "account",
  },
  {
    name: "create_world_backup",
    group: "worlds",
    risk: "write",
    need: "account",
  },
  { name: "rename_world", group: "worlds", risk: "write", need: "account" },
  {
    name: "restore_world_backup",
    group: "worlds",
    risk: "destructive",
    need: "account",
  },
  {
    name: "delete_world_backup",
    group: "worlds",
    risk: "destructive",
    need: "account",
  },

  { name: "read_game_log", group: "diagnostics", risk: "read", need: "none" },
  { name: "get_last_crash", group: "diagnostics", risk: "read", need: "none" },
  { name: "list_servers", group: "diagnostics", risk: "read", need: "none" },

  { name: "list_skins", group: "skins", risk: "read", need: "account" },
  { name: "select_skin", group: "skins", risk: "write", need: "account" },
  {
    name: "import_skin_by_nickname",
    group: "skins",
    risk: "write",
    need: "both",
  },

  {
    name: "read_launcher_settings",
    group: "system",
    risk: "read",
    need: "none",
  },
  { name: "get_system_info", group: "system", risk: "read", need: "none" },
  { name: "get_storage_usage", group: "system", risk: "read", need: "none" },
  { name: "list_accounts", group: "system", risk: "read", need: "none" },
  { name: "set_memory", group: "system", risk: "write", need: "none" },

  { name: "ask_user", group: "dialogue", risk: "read", need: "none" },
  { name: "update_plan", group: "dialogue", risk: "read", need: "none" },
];

const BY_NAME = new Map(CATALOG.map((tool) => [tool.name, tool]));

export function describeTool(name: string): ToolDescriptor {
  return (
    BY_NAME.get(name) ?? { name, group: "other", risk: "read", need: "none" }
  );
}

export function describeToolSurface(
  availableNames: readonly string[],
): ToolSurfaceGroup[] {
  const available = new Set(availableNames);
  const known = new Set(CATALOG.map((tool) => tool.name));
  const extra = availableNames
    .filter((name) => !known.has(name))
    .map((name) => describeTool(name));

  const groups = new Map<ToolGroupId, ToolSurfaceEntry[]>();

  for (const tool of [...CATALOG, ...extra]) {
    const entries = groups.get(tool.group) ?? [];
    entries.push({ ...tool, available: available.has(tool.name) });
    groups.set(tool.group, entries);
  }

  return TOOL_GROUP_ORDER.filter((id) => groups.has(id)).map((id) => {
    const entries = groups.get(id) ?? [];
    return {
      id,
      entries,
      availableCount: entries.filter((entry) => entry.available).length,
    };
  });
}

export function countAvailableTools(groups: ToolSurfaceGroup[]): {
  available: number;
  total: number;
} {
  return groups.reduce(
    (total, group) => ({
      available: total.available + group.availableCount,
      total: total.total + group.entries.length,
    }),
    { available: 0, total: 0 },
  );
}

export function unavailableReason(
  need: ToolNeed,
  state: { isOnline: boolean; hasAccount: boolean },
): "internet" | "account" | null {
  if ((need === "internet" || need === "both") && !state.isOnline) {
    return "internet";
  }
  if ((need === "account" || need === "both") && !state.hasAccount) {
    return "account";
  }

  return null;
}
