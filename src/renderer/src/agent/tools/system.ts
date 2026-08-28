import { getDefaultStore } from "jotai";
import { buildMemoryArguments } from "@/shared/jvmDefaults";
import {
  accountAtom,
  accountsAtom,
  installActiveAtom,
  isRunningAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { AgentTool } from "../types";
import { overriddenKeysOf } from "./instances";

const api = window.api;

export const readLauncherSettings: AgentTool = {
  name: "read_launcher_settings",
  risk: "read",
  description:
    "Read the global launcher settings. Memory (xmx), the optimized JVM flags and the high priority flag are only defaults here: an instance can override them, and then the instance value is what the game actually gets. instancesWithOverrides lists the instances that do that — read their real values with get_instance before you report or change anything about their memory.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  summarize: () => ({ key: "agent.tools.readLauncherSettings" }),
  run: async () => {
    const store = getDefaultStore();
    const settings = store.get(settingsAtom);

    const instancesWithOverrides = store
      .get(versionsAtom)
      .map((version) => ({
        name: version.version.name,
        overriddenKeys: overriddenKeysOf(version),
      }))
      .filter((entry) => entry.overriddenKeys.length > 0);

    return {
      ok: true,
      data: {
        scope: "global",
        instancesWithOverrides,
        memoryMb: settings.xmx,
        optimizedJvm: settings.optimizedJvm,
        resultingMemoryArguments: buildMemoryArguments(
          settings.xmx,
          settings.optimizedJvm,
        ),
        highPriority: settings.highPriority,
        language: settings.lang,
        downloadLimit: settings.downloadLimit,
        downloadSource: settings.downloadSource,
        crashTelemetry: settings.crashTelemetry,
        aiLogAnalysis: settings.aiLogAnalysis,
        autoWorldBackup: settings.autoWorldBackup,
        worldBackupKeep: settings.worldBackupKeep,
      },
    };
  },
};

export const getSystemInfo: AgentTool = {
  name: "get_system_info",
  risk: "read",
  description:
    "Read the machine and launcher state: operating system, total RAM, launcher version, and whether an install or a game is currently running. Check this before recommending a memory value.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  summarize: () => ({ key: "agent.tools.getSystemInfo" }),
  run: async () => {
    const store = getDefaultStore();
    const [launcherVersion, totalMemory] = await Promise.all([
      api.other.getVersion().catch(() => "unknown"),
      api.os.totalmem().catch(() => 0),
    ]);

    return {
      ok: true,
      data: {
        platform: api.platform,
        launcherVersion,
        totalMemoryMb: totalMemory
          ? Math.round(totalMemory / (1024 * 1024))
          : null,
        gameRunning: store.get(isRunningAtom),
        installRunning: store.get(installActiveAtom),
      },
    };
  },
};

export const getStorageUsage: AgentTool = {
  name: "get_storage_usage",
  risk: "read",
  description:
    "Read how much disk space the launcher uses, broken down by instances, Java runtimes, libraries, backups and caches.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  summarize: () => ({ key: "agent.tools.getStorageUsage" }),
  run: async () => {
    const breakdown = await api.storage.getBreakdown();
    if (!breakdown) return { ok: false, error: "Could not read disk usage" };

    return {
      ok: true,
      data: {
        totalBytes: breakdown.total,
        reclaimableBytes: breakdown.reclaimable,
        categories: breakdown.categories,
        instances: breakdown.versions,
        cleanup: breakdown.cleanup,
      },
    };
  },
};

export const listAccounts: AgentTool = {
  name: "list_accounts",
  risk: "read",
  description:
    "List the accounts added to the launcher and which one is selected. Tokens are never exposed.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  summarize: () => ({ key: "agent.tools.listAccounts" }),
  run: async () => {
    const store = getDefaultStore();
    const accounts = store.get(accountsAtom);
    const selected = store.get(accountAtom);

    return {
      ok: true,
      data: {
        selected: selected?.nickname ?? null,
        accounts: accounts.map((account) => ({
          nickname: account.nickname,
          type: account.type,
        })),
      },
    };
  },
};
