import { getDefaultStore } from "jotai";
import { IWorld } from "@/types/World";
import { accountAtom } from "@renderer/stores/atoms";
import { AgentTool } from "../types";
import { limitList, wrapUntrusted } from "../untrusted";
import { findInstance } from "./instances";

const api = window.api;

const READ_CONCURRENCY = 4;
const MAX_WORLDS = 30;

export const listWorlds: AgentTool = {
  name: "list_worlds",
  risk: "read",
  description:
    "List the singleplayer worlds saved inside an instance, with their folder name and installed datapacks.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.listWorlds",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const account = getDefaultStore().get(accountAtom);
    if (!account) return { ok: false, error: "No account is selected" };

    const worldsPath = await api.path.join(version.versionPath, "saves");
    if (!(await api.fs.pathExists(worldsPath))) {
      return { ok: true, data: { worlds: [] } };
    }

    const folders = (await api.fs.getDirectories(worldsPath)).filter(
      (folder) => !folder.startsWith("."),
    );
    const limited = limitList(folders, MAX_WORLDS);
    const results: (IWorld | null)[] = new Array(limited.items.length).fill(
      null,
    );
    let cursor = 0;

    await Promise.all(
      Array.from(
        { length: Math.min(READ_CONCURRENCY, limited.items.length) },
        async () => {
          while (cursor < limited.items.length) {
            const index = cursor++;
            const worldPath = await api.path.join(
              worldsPath,
              limited.items[index],
            );
            results[index] = await api.worlds.readWorld(worldPath, account);
          }
        },
      ),
    );

    const worlds = results.filter(Boolean);

    return {
      ok: true,
      data: {
        total:
          (await api.worlds.count(version.versionPath)) ??
          worlds.length + (limited.total - limited.items.length),
        truncated: limited.truncated,
        worlds: worlds.map((world) => ({
          name: wrapUntrusted(world!.name),
          folderName: world!.folderName,
          isDownloaded: world!.isDownloaded,
          datapacks: world!.datapacks,
        })),
      },
    };
  },
};

export const listWorldBackups: AgentTool = {
  name: "list_world_backups",
  risk: "read",
  description:
    "List the backups stored for one world of an instance, newest first, with their size and creation time.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      worldFolder: {
        type: "string",
        description: "Folder name of the world, as returned by list_worlds",
      },
    },
    required: ["instance", "worldFolder"],
  },
  summarize: (input) => ({
    key: "agent.tools.listWorldBackups",
    params: { name: input?.worldFolder },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const worldPath = await api.path.join(
      version.versionPath,
      "saves",
      String(input?.worldFolder ?? ""),
    );

    const list = await api.worlds.listBackups(worldPath);
    if (!list) return { ok: false, error: "Could not read the backup list" };

    return {
      ok: true,
      data: {
        skipReason: list.skipReason,
        preservedCopies: list.preserved.length,
        backups: list.backups.map((backup) => ({
          id: backup.id,
          worldFolder: backup.worldFolder,
          createdAt: backup.createdAt,
          sizeBytes: backup.size,
          trigger: backup.trigger,
        })),
      },
    };
  },
};
