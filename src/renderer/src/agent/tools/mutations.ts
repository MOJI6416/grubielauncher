import { getDefaultStore } from "jotai";
import { Loader } from "@/types/Loader";
import { ILocalProject, Provider } from "@/types/ModManager";
import { TSettings } from "@/types/Settings";
import { filterRunArguments } from "@/shared/runArguments";
import {
  clearOverride,
  isOverridden,
  resolveInstanceSettings,
  setOverride,
} from "@/shared/instanceSettings";
import {
  accountAtom,
  consolesAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import {
  countRunningConsoles,
  getGameRunner,
} from "@renderer/features/launch/runGameBridge";
import { clearInstanceSelection } from "@renderer/features/instances/selectInstance";
import { forgetContinueCache } from "@renderer/features/instances/continueCache";
import { updateInstancesFile } from "@renderer/features/instances/instancesStore";
import { forgetInstanceUpdates } from "@renderer/features/instances/updateCheck";
import { instanceKey } from "@renderer/features/instances/selectors";
import { forgetUpdateCache } from "@renderer/features/mods/useUpdateCheck";
import { forgetInstance } from "@renderer/navigation/navigate";
import { forgetInstanceKey } from "@/shared/instancesFile";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { resolveInstallPlan } from "@renderer/utilities/installPlan";
import { planDeletion } from "@renderer/utilities/mod";
import i18n from "@renderer/i18n";
import { AgentTool, ToolPreview } from "../types";
import { wrapUntrusted } from "../untrusted";
import { findInstance, overriddenKeysOf } from "./instances";
import {
  busyError,
  previewSize,
  refreshVersions,
  saveInstance,
  settings,
  syncMods,
} from "./shared";

const api = window.api;

const PROVIDERS = [Provider.MODRINTH, Provider.CURSEFORGE];

function splitArguments(value: string): string[] {
  return value.split(/\s+/).filter((part) => part !== "");
}

export const addMods: AgentTool = {
  name: "add_mods",
  risk: "write",
  description:
    "Install mods, resource packs, shaders or datapacks into an instance. Required dependencies are resolved and installed automatically. Pass the provider and project id you got from search_mods. Files are downloaded immediately.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      projects: {
        type: "array",
        description: "Projects to install",
        items: {
          type: "object",
          properties: {
            provider: { type: "string", enum: PROVIDERS },
            projectId: { type: "string" },
          },
          required: ["provider", "projectId"],
        },
      },
    },
    required: ["instance", "projects"],
  },
  summarize: (input) => ({
    key: "agent.tools.addMods",
    params: {
      count: Array.isArray(input?.projects) ? input.projects.length : 0,
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

    const requested = Array.isArray(input?.projects) ? input.projects : [];
    if (requested.length === 0) {
      return { ok: false, error: "projects must not be empty" };
    }

    const conf = version.version;
    const loader: Loader = conf.loader.name;
    const installed = [...conf.loader.mods];
    const addedAll: ILocalProject[] = [];
    const missing: string[] = [];

    for (const entry of requested) {
      const project = await api.modManager.getProject(
        entry?.provider === Provider.CURSEFORGE
          ? Provider.CURSEFORGE
          : Provider.MODRINTH,
        String(entry?.projectId ?? ""),
      );

      if (!project) {
        missing.push(String(entry?.projectId ?? ""));
        continue;
      }

      const plan = await resolveInstallPlan({
        root: project,
        installed: [...installed, ...addedAll],
        minecraftVersion: conf.version.id,
        resolveLoader: () => loader,
      });

      if (plan.dependenciesUnavailable) {
        return {
          ok: false,
          error:
            "Could not read the dependency list from the mod provider. Nothing was installed — try again when the connection is back.",
        };
      }

      if (plan.rootMissingVersion) {
        missing.push(project.title);
        continue;
      }

      addedAll.push(...plan.added);
    }

    if (addedAll.length === 0) {
      return {
        ok: false,
        error:
          missing.length > 0
            ? `Nothing was installed. No compatible version for: ${missing.join(", ")}`
            : "Everything requested is already installed",
      };
    }

    conf.loader.mods = [...installed, ...addedAll];

    const syncError = await syncMods(version);
    if (syncError) {
      conf.loader.mods = installed;
      return { ok: false, error: syncError };
    }

    const saveError = await saveInstance(version);
    if (saveError) {
      conf.loader.mods = installed;
      return { ok: false, error: saveError };
    }

    refreshVersions();

    const blocked = addedAll.filter((mod) =>
      mod.version?.files.some((file) => file.url.startsWith("blocked::")),
    );

    return {
      ok: true,
      data: {
        installedCount: addedAll.length,
        installed: wrapUntrusted(addedAll.map((mod) => mod.title).join("\n")),
        dependenciesPulledIn: addedAll.length - requested.length,
        noCompatibleVersion: wrapUntrusted(missing.join("\n")),
        needsManualDownloadCount: blocked.length,
        needsManualDownload: wrapUntrusted(
          blocked.map((mod) => mod.title).join("\n"),
        ),
      },
    };
  },
};

export const removeMods: AgentTool = {
  name: "remove_mods",
  risk: "write",
  description:
    "Remove installed projects from an instance by title. Dependencies that nothing else needs are removed too. If another installed mod still requires the target, the removal is refused and the blockers are reported.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      titles: {
        type: "array",
        items: { type: "string" },
        description: "Titles exactly as get_instance returned them",
      },
    },
    required: ["instance", "titles"],
  },
  summarize: (input) => ({
    key: "agent.tools.removeMods",
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

    const titles = Array.isArray(input?.titles) ? input.titles : [];
    const conf = version.version;
    const before = [...conf.loader.mods];

    const removed: string[] = [];
    const blocked: { title: string; requiredBy: string[] }[] = [];
    const notFound: string[] = [];
    let current = [...before];

    for (const rawTitle of titles) {
      const title = String(rawTitle ?? "").toLowerCase();
      const target = current.find((mod) => mod.title.toLowerCase() === title);

      if (!target) {
        notFound.push(String(rawTitle ?? ""));
        continue;
      }

      const plan = planDeletion(current, target);
      if (plan.blockers.length > 0) {
        blocked.push({
          title: target.title,
          requiredBy: plan.blockers.map((mod) => mod.title),
        });
        continue;
      }

      const removeKeys = new Set(
        plan.remove.map((mod) => `${mod.provider}:${mod.id}`),
      );
      current = current.filter(
        (mod) => !removeKeys.has(`${mod.provider}:${mod.id}`),
      );
      removed.push(...plan.remove.map((mod) => mod.title));
    }

    if (removed.length === 0) {
      return {
        ok: false,
        error:
          blocked.length > 0
            ? `Nothing removed. Still required by other mods: ${blocked
                .map(
                  (entry) => `${entry.title} (${entry.requiredBy.join(", ")})`,
                )
                .join("; ")}`
            : `Nothing removed. Not installed: ${notFound.join(", ")}`,
      };
    }

    conf.loader.mods = current;

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

    return {
      ok: true,
      data: {
        removedCount: removed.length,
        removed: wrapUntrusted(removed.join("\n")),
        blocked: wrapUntrusted(
          blocked
            .map((entry) => `${entry.title} | required by ${entry.requiredBy.join(", ")}`)
            .join("\n"),
        ),
        notFound: wrapUntrusted(notFound.join("\n")),
      },
    };
  },
};

export const setRunArguments: AgentTool = {
  name: "set_run_arguments",
  risk: "write",
  description:
    "Set the extra JVM and game arguments of one instance. The launcher refuses unsafe arguments such as -javaagent, -cp, -jar and path-like -D values; whatever it drops is reported back to you, so check the result instead of assuming everything applied. Memory is NOT set here — use set_memory, which can target this one instance.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      jvm: { type: "string", description: "Space separated JVM arguments" },
      game: { type: "string", description: "Space separated game arguments" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.setRunArguments",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const conf = version.version;
    const jvm =
      typeof input?.jvm === "string" ? input.jvm : conf.runArguments.jvm;
    const game =
      typeof input?.game === "string" ? input.game : conf.runArguments.game;

    const jvmResult = filterRunArguments(splitArguments(jvm), "jvm");
    const gameResult = filterRunArguments(splitArguments(game), "game");

    const previousArguments = conf.runArguments;
    conf.runArguments = {
      jvm: jvmResult.safe.join(" "),
      game: gameResult.safe.join(" "),
    };

    const saveError = await saveInstance(version);
    if (saveError) {
      conf.runArguments = previousArguments;
      return { ok: false, error: saveError };
    }

    refreshVersions();

    return {
      ok: true,
      data: {
        applied: conf.runArguments,
        rejectedByLauncher: {
          jvm: jvmResult.rejected,
          game: gameResult.rejected,
        },
      },
    };
  },
};

export const setMemory: AgentTool = {
  name: "set_memory",
  risk: "write",
  description:
    "Set how much RAM the game gets, in megabytes, and optionally the optimized JVM flags. Without `instance` this writes the GLOBAL default, which only reaches the instances that do not override it — the result lists the ones that keep their own value, and those did NOT change. With `instance` it writes an override on that one instance, and the override wins over the global default. Pass instance together with inherit: true to drop that override so the instance follows the global default again. The new value applies to the next launch. Check get_system_info and get_instance first, and leave the operating system a few gigabytes.",
  parameters: {
    type: "object",
    properties: {
      memoryMb: {
        type: "number",
        description: "At least 1024. Not needed when inherit is true.",
      },
      optimizedJvm: {
        type: "boolean",
        description: "Turn the optimized garbage collector flags on or off",
      },
      instance: {
        type: "string",
        description:
          "Exact instance name to set an override on. Omit to change the global default for every instance that has no override.",
      },
      inherit: {
        type: "boolean",
        description:
          "Only with instance: remove its memory and optimized JVM overrides so it follows the global default again.",
      },
    },
    required: [],
  },
  summarize: (input) => ({
    key: input?.instance
      ? "agent.tools.setMemoryInstance"
      : "agent.tools.setMemory",
    params: { value: input?.memoryMb, name: input?.instance },
  }),
  run: async (input) => {
    const requestedInstance =
      typeof input?.instance === "string" && input.instance.trim() !== ""
        ? input.instance
        : null;
    const inherit = input?.inherit === true;

    const version = requestedInstance ? findInstance(requestedInstance) : null;
    if (requestedInstance && !version) {
      return { ok: false, error: `No instance named "${requestedInstance}"` };
    }

    if (inherit && !version) {
      return {
        ok: false,
        error:
          "inherit only makes sense together with instance. Pass the instance name, or omit inherit to change the global default.",
      };
    }

    if (version && inherit) {
      const conf = version.version;
      const previousOverrides = conf.overrides;
      conf.overrides = clearOverride(
        clearOverride(conf.overrides, "xmx"),
        "optimizedJvm",
      );

      const saveError = await saveInstance(version);
      if (saveError) {
        conf.overrides = previousOverrides;
        return { ok: false, error: saveError };
      }

      refreshVersions();

      const resolved = resolveInstanceSettings(settings(), conf.overrides);

      return {
        ok: true,
        data: {
          scope: "instance",
          instance: conf.name,
          inherited: true,
          memoryMb: resolved.xmx,
          optimizedJvm: resolved.optimizedJvm,
          overriddenKeys: overriddenKeysOf(version),
          appliesToNextLaunch: true,
        },
      };
    }

    const requested = Math.round(Number(input?.memoryMb));
    if (!Number.isFinite(requested) || requested < 1024) {
      return { ok: false, error: "memoryMb must be a number of at least 1024" };
    }

    const total = await api.os.totalmem().catch(() => 0);
    const totalMb = total ? Math.round(total / (1024 * 1024)) : 0;
    if (totalMb && requested > totalMb - 1024) {
      return {
        ok: false,
        error: `The machine has ${totalMb} MB of RAM. Leave at least 1024 MB to the operating system.`,
      };
    }

    if (version) {
      const conf = version.version;
      const previousOverrides = conf.overrides;
      let next = setOverride(conf.overrides, "xmx", requested);
      if (typeof input?.optimizedJvm === "boolean") {
        next = setOverride(next, "optimizedJvm", input.optimizedJvm);
      }
      conf.overrides = next;

      const saveError = await saveInstance(version);
      if (saveError) {
        conf.overrides = previousOverrides;
        return { ok: false, error: saveError };
      }

      refreshVersions();

      const resolved = resolveInstanceSettings(settings(), conf.overrides);

      return {
        ok: true,
        data: {
          scope: "instance",
          instance: conf.name,
          memoryMb: resolved.xmx,
          optimizedJvm: resolved.optimizedJvm,
          overriddenKeys: overriddenKeysOf(version),
          totalMemoryMb: totalMb,
          appliesToNextLaunch: true,
        },
      };
    }

    const patch: Partial<TSettings> = { xmx: requested };
    if (typeof input?.optimizedJvm === "boolean") {
      patch.optimizedJvm = input.optimizedJvm;
    }

    await patchSettings(patch);

    const unaffected = getDefaultStore()
      .get(versionsAtom)
      .filter((entry) => isOverridden(entry.version.overrides, "xmx"))
      .map((entry) => entry.version.name);

    return {
      ok: true,
      data: {
        scope: "global",
        memoryMb: requested,
        totalMemoryMb: totalMb,
        instancesKeepingTheirOwnMemory: unaffected,
        appliesToNextLaunch: true,
      },
    };
  },
};

export const launchInstance: AgentTool = {
  name: "launch_instance",
  risk: "write",
  description:
    "Start the game for an instance. Only do this when the user asked to play or to verify a fix.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.launchInstance",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const store = getDefaultStore();
    const account = store.get(accountAtom);
    if (!account) return { ok: false, error: "No account is selected" };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const launch = getGameRunner();
    if (!launch) {
      return {
        ok: false,
        error: "The launcher is not ready to start a game yet",
      };
    }

    const name = version.version.name;
    const before = countRunningConsoles(store.get(consolesAtom).consoles, name);

    await launch({ version });

    const after = countRunningConsoles(store.get(consolesAtom).consoles, name);
    if (after > before) return { ok: true, data: { launched: name } };

    return {
      ok: false,
      error:
        "The launcher did not start the game. It may be waiting for the user to confirm a modpack update, or the launch failed — check the launcher window.",
    };
  },
};

export const deleteInstance: AgentTool = {
  name: "delete_instance",
  risk: "destructive",
  description:
    "Delete an instance and its files, including its worlds. The folder goes to the system trash, so the user can still restore it by hand — but the launcher forgets the instance either way, and if the trash refuses the folder it is erased for good, which the result tells you. Never call it unless the user explicitly asked to delete that exact instance.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.deleteInstance",
    params: { name: input?.instance },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;

    const conf = version.version;
    const savesPath = await api.path.join(version.versionPath, "saves");
    const worlds = (await api.fs.pathExists(savesPath))
      ? (await api.fs.getDirectories(savesPath)).filter(
          (folder) => !folder.startsWith("."),
        ).length
      : 0;
    const bytes = (await api.file.getTotalSizes([version.versionPath])) ?? 0;

    return {
      rows: [
        { key: "instance", value: conf.name },
        {
          key: "minecraft",
          value:
            conf.loader.name === "vanilla"
              ? conf.version.id
              : `${conf.version.id} · ${conf.loader.name}`,
        },
        {
          key: "projects",
          value: String(conf.loader.mods.length),
        },
        { key: "worlds", value: String(worlds) },
        ...(bytes > 0
          ? [{ key: "size", value: previewSize(bytes) }]
          : []),
      ],
      loss: i18n.t(
        worlds > 0
          ? "agent.preview.instanceLossWorlds"
          : "agent.preview.instanceLoss",
        { count: worlds },
      ),
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const store = getDefaultStore();
    const account = store.get(accountAtom);
    if (!account) return { ok: false, error: "No account is selected" };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const name = version.version.name;
    const instancePath = version.versionPath;
    const key = instanceKey(version);
    const projectCount = version.version.loader.mods.length;
    const result = await version.delete(account, false).catch(() => null);

    if (!result) {
      return {
        ok: false,
        error: `The launcher could not delete "${name}". Its files may be locked by the game or an antivirus, or another install is running.`,
      };
    }

    store.set(consolesAtom, (previous) => ({
      consoles: previous.consoles.filter(
        (entry) => entry.versionName !== name,
      ),
    }));

    forgetContinueCache(instancePath);
    forgetUpdateCache();
    forgetInstanceUpdates(key);
    forgetInstance(key);

    if (store.get(selectedVersionAtom)?.versionPath === instancePath) {
      clearInstanceSelection();
    }

    updateInstancesFile((file) => forgetInstanceKey(file, key));

    store.set(
      versionsAtom,
      store
        .get(versionsAtom)
        .filter((entry) =>
          instancePath && entry.versionPath
            ? entry.versionPath !== instancePath
            : entry.version.name !== name,
        ),
    );

    return {
      ok: true,
      data: {
        deleted: name,
        trashed: result.trashed,
        recoverable: result.trashed,
        projectsGone: projectCount,
      },
    };
  },
};
