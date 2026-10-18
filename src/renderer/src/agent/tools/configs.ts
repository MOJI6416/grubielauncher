import {
  MAX_CONFIG_BYTES,
  collectInstanceConfigs,
} from "@renderer/features/configs/configFiles";
import {
  ConfigField,
  descriptionLines,
  fieldHints,
  parseConfigDocument,
  serializeFieldValue,
  writeField,
} from "@renderer/features/configs/document";
import {
  BackupStorage,
  backupsRoot,
  captureSnapshot,
  loadBackupIndex,
} from "@renderer/features/configs/backups";
import { Version } from "@renderer/classes/Version";
import { AgentTool, ToolPreview } from "../types";
import { limitList, truncate, wrapUntrusted } from "../untrusted";
import { OPTION_KEYS, planOptions, readOptions, writeOptions } from "../gameOptions";
import { textHash } from "../textHash";
import { findInstance } from "./instances";
import { busyError } from "./shared";

const api = window.api;

const EDITABLE_ROOTS = ["config", "defaultconfigs"];
const MAX_LISTED_CONFIGS = 80;
const MAX_FIELDS = 150;
const MAX_DESCRIPTION = 160;
const MAX_CHANGES = 20;
const MAX_UNDO_TEXT = 200 * 1024;
const MAX_RAW_CHARS = 6000;

const OPTIONS_MEANING =
  "Values are exactly as Minecraft stores them. fov is -1..1 where 0 is 70 degrees and 1 is 110. gamma is 0..1 brightness. particles: 0 all, 1 decreased, 2 minimal. graphicsMode: 0 fast, 1 fancy, 2 fabulous. guiScale 0 is auto. maxFps 260 means unlimited. renderDistance and simulationDistance are in chunks.";

const storage: BackupStorage = {
  join: (...parts) => api.path.join(...parts),
  ensure: (directory) => api.fs.ensure(directory),
  readFile: (filePath, encoding) => api.fs.readFile(filePath, encoding),
  writeFile: (filePath, data, encoding) =>
    api.fs.writeFile(filePath, data, encoding),
  pathExists: (target) => api.fs.pathExists(target),
  rimraf: (target) => api.fs.rimraf(target),
};

function noInstance(name: unknown) {
  return { ok: false as const, error: `No instance named "${name}"` };
}

async function readText(path: string): Promise<string | null> {
  if (!(await api.fs.pathExists(path))) return null;
  return await api.fs.readFile(path, "utf-8").catch(() => null);
}

function optionsPath(version: Version): string {
  return api.path.join(version.versionPath, "options.txt");
}

type ConfigLocation = { file: string; path: string; snapshotKey: string };

async function locateConfig(
  version: Version,
  file: unknown,
): Promise<ConfigLocation | { error: string }> {
  const clean = String(file ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
  const parts = clean.split("/");

  if (
    clean === "" ||
    /^[a-z]:/i.test(clean) ||
    clean.startsWith("/") ||
    parts.length < 2 ||
    parts.some((part) => part === "" || part === "." || part === "..") ||
    !EDITABLE_ROOTS.includes(parts[0])
  ) {
    return {
      error:
        "file must be a path inside config/ or defaultconfigs/ exactly as list_mod_configs returned it",
    };
  }

  return {
    file: clean,
    path: api.path.join(version.versionPath, ...parts),
    snapshotKey: parts[0] === "config" ? parts.slice(1).join("/") : clean,
  };
}

function fieldPath(field: ConfigField): string {
  return [...field.section, field.key].join(".");
}

type ConfigChange = {
  key: string;
  from: string;
  to: string;
};

type ConfigPlan = {
  text: string;
  changes: ConfigChange[];
  errors: string[];
};

function coerce(
  field: ConfigField,
  requested: unknown,
): { ok: true; value: boolean | number | string } | { ok: false; error: string } {
  const key = fieldPath(field);
  const hints = fieldHints(field.comments);

  if (field.kind === "boolean") {
    const lower = String(requested).trim().toLowerCase();
    if (lower !== "true" && lower !== "false") {
      return { ok: false, error: `${key} takes true or false` };
    }
    return { ok: true, value: lower === "true" };
  }

  if (field.kind === "number") {
    const number = Number(requested);
    if (String(requested).trim() === "" || !Number.isFinite(number)) {
      return { ok: false, error: `${key} takes a number` };
    }
    if (field.numberStyle === "integer" && !Number.isInteger(number)) {
      return { ok: false, error: `${key} takes a whole number` };
    }
    if (hints.min !== undefined && number < hints.min) {
      return { ok: false, error: `${key} cannot go below ${hints.min}` };
    }
    if (hints.max !== undefined && number > hints.max) {
      return { ok: false, error: `${key} cannot go above ${hints.max}` };
    }
    return { ok: true, value: number };
  }

  if (field.kind === "string") {
    const value = String(requested ?? "");
    if (hints.allowed?.length) {
      const match = hints.allowed.find(
        (allowed) => allowed.toLowerCase() === value.toLowerCase(),
      );
      if (!match) {
        return {
          ok: false,
          error: `${key} takes one of: ${hints.allowed.join(", ")}`,
        };
      }
      return { ok: true, value: match };
    }
    return { ok: true, value };
  }

  return {
    ok: false,
    error: `${key} is a list or a nested value; ask the user to change it in the Configs tab`,
  };
}

function planConfig(
  text: string,
  fileName: string,
  requested: unknown,
): ConfigPlan {
  const plan: ConfigPlan = { text, changes: [], errors: [] };
  const entries = Array.isArray(requested) ? requested.slice(0, MAX_CHANGES) : [];

  if (entries.length === 0) {
    plan.errors.push("changes must list at least one key");
    return plan;
  }

  for (const entry of entries) {
    const key = String(entry?.key ?? "").trim();
    const document = parseConfigDocument(plan.text, fileName);
    if (!document) {
      plan.errors.push("The assistant cannot edit this file format");
      return plan;
    }

    const matches = document.fields.filter((field) => fieldPath(field) === key);
    if (matches.length !== 1) {
      plan.errors.push(
        matches.length === 0
          ? `${key} is not in this file`
          : `${key} appears more than once; ask the user to change it in the Configs tab`,
      );
      continue;
    }

    const field = matches[0];
    const coerced = coerce(field, entry?.value);
    if (!coerced.ok) {
      plan.errors.push(coerced.error);
      continue;
    }

    const serialized = serializeFieldValue(document.format, field, coerced.value);
    if (serialized === field.raw) continue;

    plan.text = writeField(plan.text, document.format, field, coerced.value);
    plan.changes.push({ key, from: field.raw, to: serialized });
  }

  return plan;
}

export const readGameOptions: AgentTool = {
  name: "read_game_options",
  risk: "read",
  description:
    "Read the video and comfort options of an instance from its options.txt: render and simulation distance, FPS limit, VSync, clouds, particles, graphics mode, GUI scale, language and similar. Use it before suggesting graphics changes, and to see why the game looks or performs the way it does.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.readGameOptions",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) return noInstance(input?.instance);

    const text = await readText(optionsPath(version));
    if (text === null) {
      return {
        ok: true,
        data: {
          exists: false,
          note: "The game has not been started in this instance yet, so it has no options.txt. Options can be changed after the first launch.",
        },
      };
    }

    return {
      ok: true,
      data: { exists: true, options: readOptions(text), meaning: OPTIONS_MEANING },
    };
  },
};

export const setGameOptions: AgentTool = {
  name: "set_game_options",
  risk: "write",
  description: `Change video and comfort options in an instance's options.txt. Pass values as an object, for example {"renderDistance": 8, "renderClouds": "fast"}. Only these keys are allowed: ${OPTION_KEYS.join(", ")}. A key must already be in the file — Minecraft versions differ — so read_game_options first. Values keep the format the file already uses. The game must be closed; the change shows on the next launch. ${OPTIONS_MEANING}`,
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      values: {
        type: "object",
        description: "Option name to new value",
      },
    },
    required: ["instance", "values"],
  },
  summarize: (input) => ({
    key: "agent.tools.setGameOptions",
    params: { name: input?.instance },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;

    const text = await readText(optionsPath(version));
    if (text === null) return null;

    const plan = planOptions(text, input?.values);

    return {
      rows: [
        { key: "instance", value: version.version.name },
        ...plan.changes.map((change) => ({
          key: `option-${change.key}`,
          label: change.key,
          from: change.from,
          value: change.to,
        })),
        ...(plan.errors.length
          ? [{ key: "skipped", value: plan.errors.join("; ") }]
          : []),
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) return noInstance(input?.instance);

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const path = optionsPath(version);
    const text = await readText(path);
    if (text === null) {
      return {
        ok: false,
        error: "This instance has no options.txt yet. The game must be started once first.",
      };
    }

    const plan = planOptions(text, input?.values);
    if (plan.errors.length) {
      return { ok: false, error: `Nothing changed. ${plan.errors.join("; ")}` };
    }
    if (plan.changes.length === 0) {
      return { ok: true, data: { changed: [], note: "Everything already had these values" } };
    }

    const next = writeOptions(
      text,
      Object.fromEntries(plan.changes.map((change) => [change.key, change.to])),
    );

    if (!(await api.fs.writeFile(path, next, "utf-8"))) {
      return {
        ok: false,
        error: "The launcher could not write options.txt, so nothing changed",
      };
    }

    return {
      ok: true,
      data: { changed: plan.changes, appliesToNextLaunch: true },
      undo: {
        op: "gameOptions",
        instance: version.version.name,
        values: Object.fromEntries(
          plan.changes.map((change) => [change.key, change.from]),
        ),
      },
    };
  },
};

export const listModConfigs: AgentTool = {
  name: "list_mod_configs",
  risk: "read",
  description:
    "List the mod config files of an instance under config/ and defaultconfigs/. Pass query to narrow it down by a mod name or part of a path, for example \"sodium\" or \"jei\". Use the returned path with read_mod_config.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      query: { type: "string", description: "Optional part of a path" },
    },
    required: ["instance"],
  },
  summarize: (input) => ({
    key: "agent.tools.listModConfigs",
    params: { name: input?.instance },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) return noInstance(input?.instance);

    const found = await collectInstanceConfigs(
      api.fs.readdirWithTypes,
      api.fs.pathExists,
      (...parts: string[]) => api.path.join(...parts),
      version.versionPath,
    );

    const needle = String(input?.query ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const configRoot = api.path.join(version.versionPath, "config");
    const paths = found
      .map((entry) =>
        entry.base === configRoot ? `config/${entry.relative}` : entry.relative,
      )
      .filter((path) => EDITABLE_ROOTS.includes(path.split("/")[0]))
      .filter((path) => parseConfigDocument("", path) !== null)
      .filter(
        (path) =>
          needle === "" ||
          path.toLowerCase().replace(/[^a-z0-9/]/g, "").includes(needle),
      );

    const limited = limitList(paths, MAX_LISTED_CONFIGS);

    return {
      ok: true,
      data: {
        total: limited.total,
        truncated: limited.truncated,
        files: wrapUntrusted(limited.items.join("\n")),
      },
    };
  },
};

export const readModConfig: AgentTool = {
  name: "read_mod_config",
  risk: "read",
  description:
    "Read one mod config file as a list of settings: the key to pass to set_mod_config_values, its current value and type, the allowed range or values when the file states them, and the mod author's description.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      file: {
        type: "string",
        description: "Path exactly as list_mod_configs returned it",
      },
    },
    required: ["instance", "file"],
  },
  summarize: (input) => ({
    key: "agent.tools.readModConfig",
    params: { name: input?.file },
  }),
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) return noInstance(input?.instance);

    const location = await locateConfig(version, input?.file);
    if ("error" in location) return { ok: false, error: location.error };

    const size = (await api.file.getTotalSizes([location.path])) ?? 0;
    if (size > MAX_CONFIG_BYTES) {
      return { ok: false, error: "The file is too large for the assistant" };
    }

    const text = await readText(location.path);
    if (text === null) {
      return { ok: false, error: `No file ${location.file} in this instance` };
    }

    const document = parseConfigDocument(text, location.file);
    if (!document) {
      return {
        ok: true,
        data: {
          file: location.file,
          editable: false,
          raw: wrapUntrusted(truncate(text, MAX_RAW_CHARS)),
        },
      };
    }

    const fields = limitList(document.fields, MAX_FIELDS);

    return {
      ok: true,
      data: {
        file: location.file,
        format: document.format,
        editable: true,
        syntaxProblem: document.issue ? document.issue.code : null,
        totalFields: fields.total,
        truncated: fields.truncated,
        fields: wrapUntrusted(
          JSON.stringify(
            fields.items.map((field) => {
              const hints = fieldHints(field.comments);
              const description = descriptionLines(field.comments)
                .map((line) => line.text)
                .join(" ")
                .slice(0, MAX_DESCRIPTION);

              return {
                key: fieldPath(field),
                type: field.kind,
                value: field.value,
                ...(hints.min !== undefined ? { min: hints.min } : {}),
                ...(hints.max !== undefined ? { max: hints.max } : {}),
                ...(hints.allowed?.length ? { allowed: hints.allowed } : {}),
                ...(hints.defaultValue !== undefined
                  ? { default: hints.defaultValue }
                  : {}),
                ...(description ? { description } : {}),
              };
            }),
          ),
        ),
      },
    };
  },
};

export const setModConfigValues: AgentTool = {
  name: "set_mod_config_values",
  risk: "write",
  description:
    "Change settings in one mod config file. Pass the keys exactly as read_mod_config returned them. Only true/false, numbers and plain text can be set; values are checked against the type and the range the file declares, comments and formatting stay as they were, and the launcher keeps a snapshot of the old file in the Configs tab. Nothing is written if any change is invalid. The game must be closed.",
  parameters: {
    type: "object",
    properties: {
      instance: { type: "string", description: "Exact instance name" },
      file: {
        type: "string",
        description: "Path exactly as list_mod_configs returned it",
      },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            value: {
              description: "New value: true or false, a number, or text",
            },
          },
          required: ["key", "value"],
        },
      },
    },
    required: ["instance", "file", "changes"],
  },
  summarize: (input) => ({
    key: "agent.tools.setModConfigValues",
    params: { name: input?.file },
  }),
  preview: async (input): Promise<ToolPreview | null> => {
    const version = findInstance(input?.instance);
    if (!version) return null;

    const location = await locateConfig(version, input?.file);
    if ("error" in location) return null;

    const text = await readText(location.path);
    if (text === null) return null;

    const plan = planConfig(text, location.file, input?.changes);

    return {
      rows: [
        { key: "file", value: location.file },
        ...plan.changes.map((change) => ({
          key: `config-${change.key}`,
          label: change.key,
          from: change.from,
          value: change.to,
        })),
        ...(plan.errors.length
          ? [{ key: "skipped", value: plan.errors.join("; ") }]
          : []),
      ],
    };
  },
  run: async (input) => {
    const version = findInstance(input?.instance);
    if (!version) return noInstance(input?.instance);

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const location = await locateConfig(version, input?.file);
    if ("error" in location) return { ok: false, error: location.error };

    const text = await readText(location.path);
    if (text === null) {
      return { ok: false, error: `No file ${location.file} in this instance` };
    }

    const plan = planConfig(text, location.file, input?.changes);
    if (plan.errors.length) {
      return { ok: false, error: `Nothing changed. ${plan.errors.join("; ")}` };
    }
    if (plan.changes.length === 0) {
      return { ok: true, data: { changed: [], note: "Everything already had these values" } };
    }

    const root = backupsRoot(storage, version.versionPath);
    const snapshotTaken = await captureSnapshot(
      storage,
      root,
      await loadBackupIndex(storage, root),
      location.snapshotKey,
      text,
    )
      .then(() => true)
      .catch(() => false);

    if (!(await api.fs.writeFile(location.path, plan.text, "utf-8"))) {
      return {
        ok: false,
        error: "The launcher could not write the file, so nothing changed",
      };
    }

    return {
      ok: true,
      data: {
        file: location.file,
        changed: plan.changes,
        snapshotInConfigsTab: snapshotTaken,
        appliesToNextLaunch: true,
      },
      ...(text.length <= MAX_UNDO_TEXT
        ? {
            undo: {
              op: "configFile" as const,
              instance: version.version.name,
              file: location.file,
              text,
              expectHash: textHash(plan.text),
            },
          }
        : {}),
    };
  },
};

export async function restoreConfigFile(
  version: Version,
  file: string,
  text: string,
  expectHash: string,
): Promise<{ ok: boolean; error?: string }> {
  const location = await locateConfig(version, file);
  if ("error" in location) return { ok: false, error: location.error };

  const current = await readText(location.path);
  if (current === null || textHash(current) !== expectHash) {
    return {
      ok: false,
      error: "The file changed after the assistant edited it, so the old version was not put back. Restore it from the Configs tab.",
    };
  }

  return (await api.fs.writeFile(location.path, text, "utf-8"))
    ? { ok: true }
    : { ok: false, error: "The launcher could not write the file" };
}

export async function restoreGameOptions(
  version: Version,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const path = optionsPath(version);
  const text = await readText(path);
  if (text === null) return { ok: false, error: "options.txt is gone" };

  return (await api.fs.writeFile(path, writeOptions(text, values), "utf-8"))
    ? { ok: true }
    : { ok: false, error: "The launcher could not write options.txt" };
}
