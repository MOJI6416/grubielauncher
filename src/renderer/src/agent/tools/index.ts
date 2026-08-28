import { getDefaultStore } from "jotai";
import { AgentToolSpec } from "@/types/Agent";
import { accountAtom, internetAtom } from "@renderer/stores/atoms";
import { AgentTool } from "../types";
import { getInstance, listInstances } from "./instances";
import {
  getDependencies,
  getProject,
  getProjectVersions,
  searchMods,
} from "./mods";
import { listLoaderVersions, listMinecraftVersions } from "./catalog";
import {
  getStorageUsage,
  getSystemInfo,
  listAccounts,
  readLauncherSettings,
} from "./system";
import { listWorldBackups, listWorlds } from "./worlds";
import { getLastCrash, listServers, readGameLog } from "./diagnostics";
import { askUser, updatePlan } from "./interactive";
import {
  addMods,
  deleteInstance,
  launchInstance,
  removeMods,
  setMemory,
  setRunArguments,
} from "./mutations";
import { checkIntegrity, toggleMods, updateMods } from "./repair";
import {
  createWorldBackup,
  deleteWorldBackup,
  renameWorld,
  restoreWorldBackup,
} from "./worldBackups";
import { importSkinByNickname, listSkins, selectSkin } from "./skins";
import { createInstance } from "./createInstance";

const LOCAL_TOOLS: AgentTool[] = [
  askUser,
  updatePlan,
  listInstances,
  getInstance,
  readLauncherSettings,
  getSystemInfo,
  getStorageUsage,
  listAccounts,
  readGameLog,
  getLastCrash,
  listServers,
  removeMods,
  toggleMods,
  setRunArguments,
  setMemory,
  deleteInstance,
];

const ONLINE_TOOLS: AgentTool[] = [
  searchMods,
  getProject,
  getProjectVersions,
  getDependencies,
  listMinecraftVersions,
  listLoaderVersions,
  addMods,
  updateMods,
];

const ACCOUNT_TOOLS: AgentTool[] = [
  listWorlds,
  listWorldBackups,
  createWorldBackup,
  restoreWorldBackup,
  deleteWorldBackup,
  renameWorld,
  launchInstance,
  checkIntegrity,
  listSkins,
  selectSkin,
];

const ONLINE_ACCOUNT_TOOLS: AgentTool[] = [
  importSkinByNickname,
  createInstance,
];

export function buildToolList(): AgentTool[] {
  const store = getDefaultStore();
  const online = store.get(internetAtom);
  const account = Boolean(store.get(accountAtom));
  const tools = [...LOCAL_TOOLS];

  if (online) tools.push(...ONLINE_TOOLS);
  if (account) tools.push(...ACCOUNT_TOOLS);
  if (online && account) tools.push(...ONLINE_ACCOUNT_TOOLS);

  return tools;
}

export function toolSpecs(tools: AgentTool[]): AgentToolSpec[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export function findTool(
  tools: AgentTool[],
  name: string,
): AgentTool | undefined {
  return tools.find((tool) => tool.name === name);
}
