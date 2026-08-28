import { getDefaultStore } from "jotai";
import i18n from "@renderer/i18n";
import { IWorldBackup } from "@/types/WorldBackup";
import { settingsAtom } from "@renderer/stores/atoms";
import { AgentTool, ToolPreview } from "../types";
import { findInstance } from "./instances";
import { busyError, previewDate, previewSize } from "./shared";

const api = window.api;

async function resolveWorldPath(
  instance: string,
  folder: string,
): Promise<{ path: string } | { error: string }> {
  const version = findInstance(instance);
  if (!version) return { error: `No instance named "${instance}"` };

  const clean = String(folder ?? "").trim();
  if (clean === "" || clean.includes("/") || clean.includes("\\")) {
    return { error: "worldFolder must be a plain folder name" };
  }

  const path = await api.path.join(version.versionPath, "saves", clean);
  if (!(await api.fs.pathExists(path))) {
    return { error: `No world folder "${clean}" in "${instance}"` };
  }

  return { path };
}

function keepCount(): number {
  return getDefaultStore().get(settingsAtom).worldBackupKeep;
}

async function findBackup(
  backupId: string,
  instance?: string,
  worldFolder?: string,
): Promise<IWorldBackup | null> {
  const version = instance ? findInstance(instance) : undefined;
  if (!version || !worldFolder) return null;

  const worldPath = await api.path.join(
    version.versionPath,
    "saves",
    String(worldFolder),
  );
  const list = await api.worlds.listBackups(worldPath);

  return list?.backups.find((backup) => backup.id === backupId) ?? null;
}

function backupRows(backup: IWorldBackup) {
  const world =
    backup.worldName && backup.worldName !== backup.worldFolder
      ? `${backup.worldName} (${backup.worldFolder})`
      : backup.worldFolder;

  return [
    { key: "world", value: world },
    { key: "instance", value: backup.versionName },
    { key: "created", value: previewDate(backup.createdAt) },
    { key: "size", value: previewSize(backup.size) },
  ];
}

const BACKUP_ERRORS: Record<string, string> = {
  worldMissing: "The world folder is gone",
  worldTooLarge: "The world is too large to back up",
  backupTooLarge:
    "The backup is larger than the 1 GB restore limit, so it cannot be restored by the launcher",
  versionRunning: "The game is running; close it first",
  backupMissing: "That backup no longer exists",
  archiveInvalid: "The backup archive is damaged",
  failed: "The operation failed",
};

function describe(code: string): string {
  return BACKUP_ERRORS[code] ?? code;
}

export const createWorldBackup: AgentTool = {
  name: "create_world_backup",
  risk: "write",
  description:
    "Make a backup of one world of an instance. Do this before anything that could damage a world — restoring another backup, changing the Minecraft version or removing worldgen mods.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      worldFolder: {
        type: "string",
        description: "Folder name as returned by list_worlds",
      },
    },
    required: ["instance", "worldFolder"],
  },
  summarize: (input) => ({
    key: "agent.tools.createWorldBackup",
    params: { name: input?.worldFolder },
  }),
  run: async (input) => {
    const resolved = await resolveWorldPath(
      input?.instance,
      input?.worldFolder,
    );
    if ("error" in resolved) return { ok: false, error: resolved.error };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const result = await api.worlds.createBackup(resolved.path, keepCount());
    if (!result?.ok) {
      return { ok: false, error: describe(result?.error ?? "failed") };
    }

    return {
      ok: true,
      data: {
        backupId: result.backup.id,
        sizeBytes: result.backup.size,
        prunedOldBackups: result.pruned,
      },
    };
  },
};

export const restoreWorldBackup: AgentTool = {
  name: "restore_world_backup",
  risk: "destructive",
  description:
    "Replace a world with the contents of one of its backups. Everything played since that backup is lost. The launcher makes a safety backup of the current state first. Backups over 1 GB cannot be restored.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      worldFolder: {
        type: "string",
        description: "Folder name as returned by list_worlds",
      },
      backupId: {
        type: "string",
        description: "Id from list_world_backups",
      },
    },
    required: ["instance", "worldFolder", "backupId"],
  },
  summarize: (input) => ({
    key: "agent.tools.restoreWorldBackup",
    params: { name: input?.worldFolder, instance: input?.instance },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const backup = await findBackup(
      String(input?.backupId ?? ""),
      input?.instance,
      input?.worldFolder,
    );
    if (!backup) return null;

    return {
      rows: backupRows(backup),
      loss: i18n.t("agent.preview.restoreLoss", {
        date: previewDate(backup.createdAt),
      }),
    };
  },
  run: async (input) => {
    const resolved = await resolveWorldPath(
      input?.instance,
      input?.worldFolder,
    );
    if ("error" in resolved) return { ok: false, error: resolved.error };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const backupId = String(input?.backupId ?? "");
    if (backupId === "") return { ok: false, error: "backupId is required" };

    const result = await api.worlds.restoreBackup(
      backupId,
      resolved.path,
      keepCount(),
    );

    if (!result?.ok) {
      return { ok: false, error: describe(result?.error ?? "failed") };
    }

    return {
      ok: true,
      data: {
        restored: backupId,
        safetyBackupId: result.safetyBackupId,
        previousWorldKeptAt: result.preservedPath ? "yes" : "no",
      },
    };
  },
};

export const deleteWorldBackup: AgentTool = {
  name: "delete_world_backup",
  risk: "destructive",
  description:
    "Delete one stored backup of a world. The world itself is untouched, but that restore point is gone for good. Pass the instance and world folder the backup belongs to, exactly as list_world_backups was called.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      worldFolder: {
        type: "string",
        description: "Folder name as returned by list_worlds",
      },
      backupId: { type: "string", description: "Id from list_world_backups" },
    },
    required: ["instance", "worldFolder", "backupId"],
  },
  summarize: (input) => ({
    key: "agent.tools.deleteWorldBackup",
    params: { id: input?.backupId, name: input?.worldFolder },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const backup = await findBackup(
      String(input?.backupId ?? ""),
      input?.instance,
      input?.worldFolder,
    );
    if (!backup) return null;

    return {
      rows: backupRows(backup),
      loss: i18n.t("agent.preview.backupLoss"),
    };
  },
  run: async (input) => {
    const backupId = String(input?.backupId ?? "");
    if (backupId === "") return { ok: false, error: "backupId is required" };

    const resolved = await resolveWorldPath(
      input?.instance,
      input?.worldFolder,
    );
    if ("error" in resolved) return { ok: false, error: resolved.error };

    const backup = await findBackup(
      backupId,
      input?.instance,
      input?.worldFolder,
    );
    if (!backup) {
      return {
        ok: false,
        error: `No backup "${backupId}" belongs to world "${input?.worldFolder}" of "${input?.instance}". Call list_world_backups again and use an id from it.`,
      };
    }

    const result = await api.worlds.deleteBackup(backupId);
    if (!result?.ok) {
      return { ok: false, error: describe(result?.error ?? "failed") };
    }

    return {
      ok: true,
      data: {
        deleted: backupId,
        worldFolder: backup.worldFolder,
        createdAt: backup.createdAt,
      },
    };
  },
};

export const renameWorld: AgentTool = {
  name: "rename_world",
  risk: "write",
  description:
    "Change the display name of a world. The folder on disk keeps its old name, so keep using worldFolder to address it afterwards.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      worldFolder: {
        type: "string",
        description: "Folder name as returned by list_worlds",
      },
      name: { type: "string", description: "New display name" },
    },
    required: ["instance", "worldFolder", "name"],
  },
  summarize: (input) => ({
    key: "agent.tools.renameWorld",
    params: { name: input?.worldFolder },
  }),
  run: async (input) => {
    const resolved = await resolveWorldPath(
      input?.instance,
      input?.worldFolder,
    );
    if ("error" in resolved) return { ok: false, error: resolved.error };

    const name = String(input?.name ?? "").trim();
    if (name === "") return { ok: false, error: "name is required" };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const applied = await api.worlds.writeName(resolved.path, name);
    if (!applied) {
      return {
        ok: false,
        error: "The launcher could not write the world name",
      };
    }

    return { ok: true, data: { name: applied } };
  },
};
