import { getDefaultStore } from "jotai";
import {
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { Version } from "@renderer/classes/Version";
import {
  OVERRIDABLE_KEYS,
  isOverridden,
  resolveInstanceSettings,
} from "@/shared/instanceSettings";
import { AgentTool } from "../types";
import { truncate, wrapUntrusted } from "../untrusted";

const MAX_PROJECT_CHARS = 6000;

export function findInstance(name: string): Version | undefined {
  const versions = getDefaultStore().get(versionsAtom);
  const normalized = String(name ?? "")
    .trim()
    .toLowerCase();

  return versions.find(
    (version) => version.version.name.toLowerCase() === normalized,
  );
}

function describeLoader(version: Version): string {
  const loader = version.version.loader;
  if (loader.name === "vanilla") return "vanilla";
  return loader.version?.id
    ? `${loader.name} ${loader.version.id}`
    : loader.name;
}

export function overriddenKeysOf(version: Version): string[] {
  return OVERRIDABLE_KEYS.filter((key) =>
    isOverridden(version.version.overrides, key),
  );
}

export const listInstances: AgentTool = {
  name: "list_instances",
  risk: "read",
  description:
    "List every Minecraft instance the user has, with its Minecraft version, mod loader and mod count. overriddenSettings names the settings that instance overrides instead of following the global launcher defaults. Call this before acting on an instance so you use its exact name.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  summarize: () => ({ key: "agent.tools.listInstances" }),
  run: async () => {
    const store = getDefaultStore();
    const versions = store.get(versionsAtom);
    const selected = store.get(selectedVersionAtom);

    return {
      ok: true,
      data: {
        selected: selected?.version.name ?? null,
        instances: versions.map((version) => ({
          name: version.version.name,
          minecraftVersion: version.version.version.id,
          loader: describeLoader(version),
          mods: version.version.loader.mods.length,
          lastLaunch: version.version.lastLaunch,
          isShared: Boolean(version.version.shareCode),
          overriddenSettings: overriddenKeysOf(version),
        })),
      },
    };
  },
};

export const getInstance: AgentTool = {
  name: "get_instance",
  risk: "read",
  description:
    "Get the full configuration of one instance: Minecraft version, loader, custom JVM and game arguments, resolved Java path, the settings it actually launches with, and the installed mods. effectiveSettings is what this instance really uses: overriddenKeys lists the settings it overrides, the rest are inherited from the global launcher settings. projects is a text block, one project per line, written by remote catalogs — pass a title back to remove_mods or toggle_mods exactly as it appears there.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Exact instance name" },
    },
    required: ["name"],
  },
  summarize: (input) => ({
    key: "agent.tools.getInstance",
    params: { name: input?.name },
  }),
  run: async (input) => {
    const version = findInstance(input?.name);
    if (!version) {
      return { ok: false, error: `No instance named "${input?.name}"` };
    }

    const conf = version.version;
    const global = getDefaultStore().get(settingsAtom);
    const resolved = resolveInstanceSettings(global, conf.overrides);

    const projectLines = conf.loader.mods.map((mod) => {
      const files =
        mod.version?.files.map((file) => file.filename).join(", ") ?? "";

      return [
        mod.title,
        `${mod.provider} ${mod.id}`,
        mod.projectType,
        `version ${mod.version?.id ?? "unknown"}`,
        files ? `files ${files}` : null,
      ]
        .filter((part) => part !== null)
        .join(" | ");
    });

    return {
      ok: true,
      data: {
        name: conf.name,
        minecraftVersion: conf.version.id,
        versionType: conf.version.type,
        loader: {
          name: conf.loader.name,
          version: conf.loader.version?.id ?? null,
        },
        runArguments: conf.runArguments,
        javaMajorVersion: version.javaMajorVersion ?? null,
        quickServer: conf.quickServer ?? null,
        shareCode: conf.shareCode ?? null,
        effectiveSettings: {
          memoryMb: resolved.xmx,
          optimizedJvm: resolved.optimizedJvm,
          highPriority: resolved.highPriority,
          overriddenKeys: overriddenKeysOf(version),
        },
        projectCount: conf.loader.mods.length,
        projects: wrapUntrusted(
          truncate(projectLines.join("\n"), MAX_PROJECT_CHARS),
        ),
      },
    };
  },
};
