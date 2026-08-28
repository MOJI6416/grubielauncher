import { getDefaultStore } from "jotai";
import { Loader } from "@/types/Loader";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import { accountAtom, settingsAtom } from "@renderer/stores/atoms";
import { AgentTool } from "../types";
import { forgetAllModFiles } from "@renderer/features/mods/modFiles";
import { findInstance } from "./instances";
import { busyError, refreshVersions, saveInstance, syncMods } from "./shared";

const api = window.api;

const UNTOGGLEABLE = [ProjectType.WORLD, ProjectType.DATAPACK];
const MAX_UPDATE_CHECKS = 60;

function findProject(
  mods: ILocalProject[],
  title: string,
): ILocalProject | undefined {
  const needle = String(title ?? "")
    .trim()
    .toLowerCase();
  return mods.find((mod) => mod.title.toLowerCase() === needle);
}

export const toggleMods: AgentTool = {
  name: "toggle_mods",
  risk: "write",
  description:
    "Enable or disable installed mods without removing them, by renaming their file to .disabled. This is the safe way to test whether a mod causes a crash: disable it, launch, and enable it again if it was innocent. Worlds and datapacks cannot be toggled.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      titles: {
        type: "array",
        items: { type: "string" },
        description: "Titles exactly as get_instance returned them",
      },
      enabled: {
        type: "boolean",
        description: "true to enable, false to disable",
      },
    },
    required: ["instance", "titles", "enabled"],
  },
  summarize: (input) => ({
    key: input?.enabled ? "agent.tools.enableMods" : "agent.tools.disableMods",
    params: {
      count: Array.isArray(input?.titles) ? input.titles.length : 0,
      name: input?.instance,
    },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const enabled = input?.enabled === true;
    const titles = Array.isArray(input?.titles) ? input.titles : [];
    const changed: string[] = [];
    const skipped: { title: string; reason: string }[] = [];

    for (const rawTitle of titles) {
      const mod = findProject(version.version.loader.mods, rawTitle);
      if (!mod) {
        skipped.push({ title: String(rawTitle), reason: "not installed" });
        continue;
      }

      if (UNTOGGLEABLE.includes(mod.projectType)) {
        skipped.push({
          title: mod.title,
          reason: `${mod.projectType} cannot be toggled`,
        });
        continue;
      }

      const filename = mod.version?.files?.[0]?.filename;
      if (!filename) {
        skipped.push({ title: mod.title, reason: "no file on disk" });
        continue;
      }

      const folder = await api.modManager.ptToFolder(mod.projectType);
      const folderPath = await api.path.join(version.versionPath, folder);
      const enabledPath = await api.path.join(folderPath, filename);
      const disabledPath = await api.path.join(
        folderPath,
        `${filename}.disabled`,
      );

      const from = enabled ? disabledPath : enabledPath;
      const to = enabled ? enabledPath : disabledPath;

      if (!(await api.fs.pathExists(from))) {
        skipped.push({
          title: mod.title,
          reason: enabled ? "already enabled" : "already disabled",
        });
        continue;
      }

      if (!(await api.fs.rename(from, to))) {
        skipped.push({
          title: mod.title,
          reason:
            "the launcher could not rename the file on disk, so it stayed as it was",
        });
        continue;
      }

      changed.push(mod.title);
    }

    if (changed.length > 0) forgetAllModFiles(version.versionPath);

    if (changed.length === 0) {
      return {
        ok: false,
        error: `Nothing changed. ${skipped
          .map((entry) => `${entry.title}: ${entry.reason}`)
          .join("; ")}`,
      };
    }

    return { ok: true, data: { enabled, changed, skipped } };
  },
};

export const updateMods: AgentTool = {
  name: "update_mods",
  risk: "write",
  description:
    "Update installed projects of an instance to their newest release compatible with its Minecraft version and loader. Pass titles to update only those, or omit them to update everything that has a newer build. Locally added files are left alone.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      titles: {
        type: "array",
        items: { type: "string" },
        description: "Optional subset; omit to update everything",
      },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.updateMods",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const conf = version.version;
    const loader: Loader = conf.loader.name;
    const wanted = Array.isArray(input?.titles) ? input.titles : null;
    const before = [...conf.loader.mods];

    const candidates = before
      .filter((mod) => mod.provider !== Provider.LOCAL)
      .filter(
        (mod) =>
          !wanted ||
          wanted.some(
            (title) => String(title).toLowerCase() === mod.title.toLowerCase(),
          ),
      )
      .slice(0, MAX_UPDATE_CHECKS);

    if (candidates.length === 0) {
      return { ok: false, error: "Nothing to update in this instance" };
    }

    const updated: { title: string; from: string | null; to: string }[] = [];
    const next = [...before];

    for (const mod of candidates) {
      const versions = await api.modManager.getVersions(mod.provider, mod.id, {
        loader,
        version: conf.version.id,
        projectType: mod.projectType,
        modUrl: mod.url,
      });

      const latest = versions[0];
      if (!latest || latest.id === mod.version?.id) continue;

      const index = next.findIndex(
        (entry) => entry.provider === mod.provider && entry.id === mod.id,
      );
      if (index < 0) continue;

      next[index] = {
        ...mod,
        version: {
          id: latest.id,
          files: latest.files.map((file) => ({
            filename: file.filename,
            size: file.size,
            isServer: file.isServer,
            isClient: file.isClient,
            url: file.url,
            sha1: file.sha1,
          })),
          dependencies: mod.version?.dependencies ?? [],
        },
      };

      updated.push({
        title: mod.title,
        from: mod.version?.id ?? null,
        to: latest.id,
      });
    }

    if (updated.length === 0) {
      return { ok: true, data: { updated: [], note: "Everything is current" } };
    }

    conf.loader.mods = next;

    const syncError = await syncMods(version);
    if (syncError) {
      conf.loader.mods = before;
      return { ok: false, error: syncError };
    }

    const saveError = await saveInstance(version);
    if (saveError) {
      conf.loader.mods = before;
      return { ok: false, error: saveError };
    }

    refreshVersions();

    return { ok: true, data: { updated } };
  },
};

export const checkIntegrity: AgentTool = {
  name: "check_integrity",
  risk: "write",
  description:
    "Verify an instance and re-download anything missing or corrupted: game files, libraries, assets and mods. Use it when the game fails to start with no clear cause, or after a download was interrupted. It does not remove anything the user added.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.checkIntegrity",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const account = getDefaultStore().get(accountAtom);
    if (!account) return { ok: false, error: "No account is selected" };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const result = await api.version.install(
      account,
      getDefaultStore().get(settingsAtom),
      version.version,
      [],
      { operation: "integrity" },
    );

    if (!result) return { ok: false, error: "The launcher did not answer" };
    if (result.cancelled)
      return { ok: false, error: "The check was cancelled" };
    if (!result.success) {
      return { ok: false, error: result.error || "The integrity check failed" };
    }

    refreshVersions();

    return {
      ok: true,
      data: {
        instance: version.version.name,
        failedDownloads: result.failures?.length ?? 0,
      },
    };
  },
};
