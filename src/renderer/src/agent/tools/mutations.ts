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
import { localTitle } from "@renderer/features/mods/entries";
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
import { projectKey } from "../modsDelta";
import {
  describeInstanceJava,
  findInstance,
  overriddenKeysOf,
} from "./instances";
import { isValidJavaMajor, javaFit } from "@/shared/javaRuntime";
import { instanceRequiredJava } from "@renderer/features/java/javaChoices";
import type { Version } from "@renderer/classes/Version";
import {
  busyError,
  createPlanCache,
  modsFingerprint,
  previewList,
  previewMemory,
  previewSize,
  previewText,
  previewToggle,
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

type AdditionPlan = {
  added: ILocalProject[];
  rootKeys: Set<string>;
  missing: string[];
  alreadyInstalled: string[];
  dependenciesUnavailable: boolean;
};

const additionPlans = createPlanCache<AdditionPlan>();

function requestedProjects(input: any): any[] {
  return Array.isArray(input?.projects) ? input.projects : [];
}

function additionKey(version: Version, requested: any[]): string {
  return [
    version.versionPath,
    JSON.stringify(requested),
    modsFingerprint(version.version.loader.mods),
  ].join("\n");
}

async function planAdditions(
  version: Version,
  requested: any[],
): Promise<AdditionPlan> {
  const conf = version.version;
  const loader: Loader = conf.loader.name;
  const installed = [...conf.loader.mods];
  const plan: AdditionPlan = {
    added: [],
    rootKeys: new Set(),
    missing: [],
    alreadyInstalled: [],
    dependenciesUnavailable: false,
  };

  for (const entry of requested) {
    const project = await api.modManager.getProject(
      entry?.provider === Provider.CURSEFORGE
        ? Provider.CURSEFORGE
        : Provider.MODRINTH,
      String(entry?.projectId ?? ""),
    );

    if (!project) {
      plan.missing.push(String(entry?.projectId ?? ""));
      continue;
    }

    const resolved = await resolveInstallPlan({
      root: project,
      installed: [...installed, ...plan.added],
      minecraftVersion: conf.version.id,
      resolveLoader: () => loader,
    });

    if (resolved.dependenciesUnavailable) {
      return { ...plan, dependenciesUnavailable: true };
    }

    if (resolved.rootMissingVersion) {
      plan.missing.push(project.title);
      continue;
    }

    const rootKey = `${project.provider}:${project.id}`;
    if (
      !resolved.added.some((mod) => `${mod.provider}:${mod.id}` === rootKey)
    ) {
      plan.alreadyInstalled.push(project.title);
    }

    plan.rootKeys.add(rootKey);
    plan.added.push(...resolved.added);
  }

  return plan;
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
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    const requested = requestedProjects(input);
    if (!version || requested.length === 0) return null;

    const plan = await planAdditions(version, requested);
    if (plan.dependenciesUnavailable) return null;

    additionPlans.remember(additionKey(version, requested), plan);

    const roots = plan.added.filter((mod) =>
      plan.rootKeys.has(`${mod.provider}:${mod.id}`),
    );
    const dependencies = plan.added.filter(
      (mod) => !plan.rootKeys.has(`${mod.provider}:${mod.id}`),
    );

    return {
      rows: [
        { key: "instance", value: version.version.name },
        ...(roots.length
          ? [{ key: "install", value: previewList(roots.map((mod) => mod.title)) }]
          : []),
        ...(dependencies.length
          ? [
              {
                key: "dependencies",
                value: previewList(dependencies.map((mod) => mod.title)),
              },
            ]
          : []),
        ...(plan.alreadyInstalled.length
          ? [{ key: "alreadyInstalled", value: previewList(plan.alreadyInstalled) }]
          : []),
        ...(plan.missing.length
          ? [{ key: "noVersion", value: previewList(plan.missing) }]
          : []),
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const requested = requestedProjects(input);
    if (requested.length === 0) {
      return { ok: false, error: "projects must not be empty" };
    }

    const conf = version.version;
    const installed = [...conf.loader.mods];
    const plan =
      additionPlans.take(additionKey(version, requested)) ??
      (await planAdditions(version, requested));

    if (plan.dependenciesUnavailable) {
      return {
        ok: false,
        error:
          "Could not read the dependency list from the mod provider. Nothing was installed — try again when the connection is back.",
      };
    }

    const addedAll = plan.added;
    const missing = plan.missing;

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
      undo: {
        op: "mods",
        instance: conf.name,
        put: [],
        drop: addedAll.map(projectKey),
      },
    };
  },
};

function planRemoval(mods: ILocalProject[], rawTitles: unknown) {
  const titles = Array.isArray(rawTitles) ? rawTitles : [];
  const targets: ILocalProject[] = [];
  const notFound: string[] = [];

  for (const rawTitle of titles) {
    const title = String(rawTitle ?? "").toLowerCase();
    const target = mods.find((mod) => localTitle(mod).toLowerCase() === title);

    if (!target) {
      notFound.push(String(rawTitle ?? ""));
      continue;
    }

    targets.push(target);
  }

  return { targets, notFound, ...planDeletion(mods, targets) };
}

export const removeMods: AgentTool = {
  name: "remove_mods",
  risk: "write",
  description:
    "Remove installed projects from an instance by title. Dependencies that nothing else needs are removed too. If another installed mod still requires the target, the removal is refused and the blockers are reported. Use it only when the user asked to remove something: to fix a crash or test a suspect, disable the mod with toggle_mods instead, which keeps the file and can be undone at no cost.",
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
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;

    const plan = planRemoval(version.version.loader.mods, input?.titles);
    const targetKeys = new Set(
      plan.targets.map((mod) => `${mod.provider}:${mod.id}`),
    );
    const extra = plan.remove.filter(
      (mod) => !targetKeys.has(`${mod.provider}:${mod.id}`),
    );

    return {
      rows: [
        { key: "instance", value: version.version.name },
        ...(plan.blockers.length === 0 && plan.targets.length
          ? [
              {
                key: "remove",
                value: previewList(plan.targets.map((mod) => mod.title)),
              },
            ]
          : []),
        ...(plan.blockers.length === 0 && extra.length
          ? [{ key: "alsoRemoved", value: previewList(extra.map((mod) => mod.title)) }]
          : []),
        ...(plan.blockers.length
          ? [
              {
                key: "blockedBy",
                value: previewList(plan.blockers.map((mod) => mod.title)),
              },
            ]
          : []),
        ...(plan.notFound.length
          ? [{ key: "notInstalled", value: previewList(plan.notFound) }]
          : []),
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const conf = version.version;
    const before = [...conf.loader.mods];

    const removed: string[] = [];
    const blocked: { title: string; requiredBy: string[] }[] = [];
    let current = [...before];

    const plan = planRemoval(before, input?.titles);
    const { targets, notFound } = plan;
    if (plan.blockers.length > 0) {
      blocked.push({ title: targets.map((mod) => mod.title).join(", "), requiredBy: plan.blockers.map((mod) => mod.title) });
    } else {
      const removeKeys = new Set(plan.remove.map((mod) => `${mod.provider}:${mod.id}`));
      current = current.filter((mod) => !removeKeys.has(`${mod.provider}:${mod.id}`));
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

    const restorable = plan.remove.filter(
      (mod) => mod.provider !== Provider.LOCAL,
    );
    const lostForGood = plan.remove.filter(
      (mod) => mod.provider === Provider.LOCAL,
    );

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
        ...(lostForGood.length
          ? {
              localFilesTheUndoButtonCannotBringBack: wrapUntrusted(
                lostForGood.map((mod) => mod.title).join("\n"),
              ),
            }
          : {}),
      },
      ...(restorable.length
        ? {
            undo: {
              op: "mods" as const,
              instance: conf.name,
              put: restorable,
              drop: [],
            },
          }
        : {}),
    };
  },
};

function filterRequestedArguments(version: Version, input: any) {
  const current = version.version.runArguments;
  const jvm = typeof input?.jvm === "string" ? input.jvm : current.jvm;
  const game = typeof input?.game === "string" ? input.game : current.game;

  return {
    jvmResult: filterRunArguments(splitArguments(jvm), "jvm"),
    gameResult: filterRunArguments(splitArguments(game), "game"),
  };
}

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
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;

    const current = version.version.runArguments;
    const { jvmResult, gameResult } = filterRequestedArguments(version, input);
    const nextJvm = jvmResult.safe.join(" ");
    const nextGame = gameResult.safe.join(" ");
    const rejected = [...jvmResult.rejected, ...gameResult.rejected];

    return {
      rows: [
        { key: "instance", value: version.version.name },
        ...(nextJvm !== current.jvm
          ? [{ key: "jvm", from: previewText(current.jvm), value: previewText(nextJvm) }]
          : []),
        ...(nextGame !== current.game
          ? [{ key: "game", from: previewText(current.game), value: previewText(nextGame) }]
          : []),
        ...(rejected.length
          ? [{ key: "rejected", value: previewList(rejected) }]
          : []),
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const conf = version.version;
    const { jvmResult, gameResult } = filterRequestedArguments(version, input);

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
      undo: {
        op: "runArguments",
        instance: conf.name,
        runArguments: previousArguments,
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
  preview: async (input): Promise<ToolPreview | null> => {
    const requestedInstance =
      typeof input?.instance === "string" && input.instance.trim() !== ""
        ? input.instance
        : null;
    const version = requestedInstance ? findInstance(requestedInstance) : null;
    if (requestedInstance && !version) return null;

    const inherit = input?.inherit === true && Boolean(version);
    const global = settings();
    const current = version
      ? resolveInstanceSettings(global, version.version.overrides)
      : { xmx: global.xmx, optimizedJvm: global.optimizedJvm };
    const nextXmx = inherit ? global.xmx : Math.round(Number(input?.memoryMb));
    if (!Number.isFinite(nextXmx) || nextXmx < 1024) return null;

    const nextOptimized = inherit
      ? global.optimizedJvm
      : typeof input?.optimizedJvm === "boolean"
        ? input.optimizedJvm
        : current.optimizedJvm;
    const keepOwn = version
      ? []
      : getDefaultStore()
          .get(versionsAtom)
          .filter((entry) => isOverridden(entry.version.overrides, "xmx"))
          .map((entry) => entry.version.name);

    return {
      rows: [
        version
          ? { key: "instance", value: version.version.name }
          : { key: "scope", value: i18n.t("agent.preview.allInstances") },
        {
          key: "memory",
          from: previewMemory(current.xmx),
          value: previewMemory(nextXmx),
        },
        ...(nextOptimized !== current.optimizedJvm
          ? [
              {
                key: "optimizedJvm",
                from: previewToggle(current.optimizedJvm),
                value: previewToggle(nextOptimized),
              },
            ]
          : []),
        ...(keepOwn.length
          ? [{ key: "keepOwn", value: previewList(keepOwn) }]
          : []),
      ],
    };
  },
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
        undo: {
          op: "overrides",
          instance: conf.name,
          values: {
            xmx: previousOverrides?.xmx ?? null,
            optimizedJvm: previousOverrides?.optimizedJvm ?? null,
          },
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
        undo: {
          op: "overrides",
          instance: conf.name,
          values: {
            xmx: previousOverrides?.xmx ?? null,
            ...(typeof input?.optimizedJvm === "boolean"
              ? { optimizedJvm: previousOverrides?.optimizedJvm ?? null }
              : {}),
          },
        },
      };
    }

    const previousSettings = settings();
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
      undo: {
        op: "settings",
        values: {
          xmx: previousSettings.xmx,
          ...(typeof input?.optimizedJvm === "boolean"
            ? { optimizedJvm: previousSettings.optimizedJvm }
            : {}),
        },
      },
    };
  },
};

export const setInstanceJava: AgentTool = {
  name: "set_instance_java",
  risk: "write",
  description:
    "Choose which Java one instance launches with. mode auto drops the manual choice so the launcher uses the Java this Minecraft version needs: that is the fix when a manual choice causes UnsupportedClassVersionError or the instance's java.launchesWith.problem is set. mode major pins a Java major version (8, 17, 21, 25): the launcher then uses the Java the user set for that major in its Java settings, or downloads its own on the next launch. A Java older than recommendedMajor from get_instance never starts the game, and Minecraft 1.16.5 and older with mods usually needs exactly 8. Only pin a major when the user asks or a log clearly shows the instance needs it. Applies to the next launch.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      mode: { type: "string", enum: ["auto", "major"] },
      major: {
        type: "number",
        description: "Java major version, only with mode major",
      },
    },
    required: ["instance", "mode"],
  },
  summarize: (input) => ({
    key:
      input?.mode === "major"
        ? "agent.tools.setInstanceJava"
        : "agent.tools.setInstanceJavaAuto",
    params: { name: input?.instance, major: input?.major },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;

    const major = Math.round(Number(input?.major));
    if (input?.mode !== "auto" && !(input?.mode === "major" && isValidJavaMajor(major))) {
      return null;
    }

    const chosen = version.version.overrides?.java;
    const running = version.java?.major;
    const from = !chosen
      ? i18n.t("agent.preview.javaAuto", {
          major: running ?? instanceRequiredJava(version),
        })
      : "major" in chosen
        ? i18n.t("agent.preview.javaMajor", { major: chosen.major })
        : i18n.t("agent.preview.javaManual", { major: running ?? "?" });
    const value =
      input.mode === "auto"
        ? i18n.t("agent.preview.javaAuto", {
            major: instanceRequiredJava(version),
          })
        : i18n.t("agent.preview.javaMajor", { major });

    return {
      rows: [
        { key: "instance", value: version.version.name },
        { key: "java", from, value },
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.instance}"` };
    }

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const mode = input?.mode;
    const major = Math.round(Number(input?.major));
    if (mode !== "auto" && mode !== "major") {
      return { ok: false, error: "mode must be auto or major" };
    }
    if (mode === "major" && !isValidJavaMajor(major)) {
      return { ok: false, error: "major must be a Java major version such as 8, 17, 21 or 25" };
    }

    const conf = version.version;
    const previousOverrides = conf.overrides;
    conf.overrides =
      mode === "auto"
        ? clearOverride(conf.overrides, "java")
        : setOverride(conf.overrides, "java", { major });

    const saveError = await saveInstance(version);
    if (saveError) {
      conf.overrides = previousOverrides;
      return { ok: false, error: saveError };
    }

    await version.init().catch(() => {});
    refreshVersions();

    const recommended = instanceRequiredJava(version);

    return {
      ok: true,
      data: {
        instance: conf.name,
        recommendedMajor: recommended,
        choice: mode === "auto" ? "auto" : `major ${major}`,
        fit: mode === "auto" ? "recommended" : javaFit(recommended, major),
        launchesWith: describeInstanceJava(version).launchesWith,
        appliesToNextLaunch: true,
      },
      undo: {
        op: "overrides",
        instance: conf.name,
        values: { java: previousOverrides?.java ?? null },
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
