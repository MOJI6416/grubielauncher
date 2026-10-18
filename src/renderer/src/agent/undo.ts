import {
  clearOverride,
  InstanceSettingsOverrides,
  setOverride,
} from "@/shared/instanceSettings";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { persistCurrentChat } from "./history";
import { applyModsDelta } from "./modsDelta";
import { patchTimelineItem, readChat } from "./store";
import { findInstance } from "./tools/instances";
import { toggleMods } from "./tools/repair";
import { selectSkin } from "./tools/skins";
import { restoreConfigFile, restoreGameOptions } from "./tools/configs";
import {
  busyError,
  refreshVersions,
  saveInstance,
  syncMods,
} from "./tools/shared";
import { AgentUndo, ToolResult } from "./types";

const api = window.api;

type OverrideKey = "xmx" | "optimizedJvm" | "java";

function missingInstance(name: string): ToolResult {
  return { ok: false, error: `No instance named "${name}"` };
}

async function undoMods(
  undo: Extract<AgentUndo, { op: "mods" }>,
): Promise<ToolResult> {
  const version = findInstance(undo.instance);
  if (!version) return missingInstance(undo.instance);

  const busy = busyError();
  if (busy) return { ok: false, error: busy };

  const conf = version.version;
  const before = conf.loader.mods;
  conf.loader.mods = applyModsDelta(before, undo.put, undo.drop);

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
  return { ok: true };
}

async function undoOverrides(
  undo: Extract<AgentUndo, { op: "overrides" }>,
): Promise<ToolResult> {
  const version = findInstance(undo.instance);
  if (!version) return missingInstance(undo.instance);

  const conf = version.version;
  const before = conf.overrides;
  let next: InstanceSettingsOverrides | undefined = conf.overrides;

  for (const [key, value] of Object.entries(undo.values) as [
    OverrideKey,
    unknown,
  ][]) {
    next =
      value === null || value === undefined
        ? clearOverride(next, key)
        : setOverride(next, key, value as never);
  }

  conf.overrides = next;

  const saveError = await saveInstance(version);
  if (saveError) {
    conf.overrides = before;
    return { ok: false, error: saveError };
  }

  if ("java" in undo.values) await version.init().catch(() => {});
  refreshVersions();
  return { ok: true };
}

async function undoRunArguments(
  undo: Extract<AgentUndo, { op: "runArguments" }>,
): Promise<ToolResult> {
  const version = findInstance(undo.instance);
  if (!version) return missingInstance(undo.instance);

  const conf = version.version;
  const before = conf.runArguments;
  conf.runArguments = undo.runArguments;

  const saveError = await saveInstance(version);
  if (saveError) {
    conf.runArguments = before;
    return { ok: false, error: saveError };
  }

  refreshVersions();
  return { ok: true };
}

async function undoWorldName(
  undo: Extract<AgentUndo, { op: "worldName" }>,
): Promise<ToolResult> {
  const version = findInstance(undo.instance);
  if (!version) return missingInstance(undo.instance);

  const path = await api.path.join(
    version.versionPath,
    "saves",
    undo.worldFolder,
  );
  const applied = await api.worlds.writeName(path, undo.name);

  return applied
    ? { ok: true }
    : { ok: false, error: "The launcher could not write the world name" };
}

export async function runUndo(undo: AgentUndo): Promise<ToolResult> {
  switch (undo.op) {
    case "mods":
      return undoMods(undo);
    case "toggle":
      return toggleMods.run({
        instance: undo.instance,
        titles: undo.titles,
        enabled: undo.enabled,
      });
    case "overrides":
      return undoOverrides(undo);
    case "settings":
      await patchSettings(undo.values);
      return { ok: true };
    case "runArguments":
      return undoRunArguments(undo);
    case "worldName":
      return undoWorldName(undo);
    case "skin":
      return selectSkin.run({ skinId: undo.skinId });
    case "gameOptions": {
      const version = findInstance(undo.instance);
      if (!version) return missingInstance(undo.instance);
      const busy = busyError();
      if (busy) return { ok: false, error: busy };
      return restoreGameOptions(version, undo.values);
    }
    case "configFile": {
      const version = findInstance(undo.instance);
      if (!version) return missingInstance(undo.instance);
      const busy = busyError();
      if (busy) return { ok: false, error: busy };
      return restoreConfigFile(
        version,
        undo.file,
        undo.text,
        undo.expectHash,
      );
    }
  }
}

export async function undoToolCall(itemId: string): Promise<void> {
  const state = readChat();
  if (state.running) return;

  const item = state.timeline.find((entry) => entry.id === itemId);
  if (!item || item.kind !== "tool" || !item.undo) return;
  if (item.undoState === "running" || item.undoState === "done") return;

  patchTimelineItem(itemId, (entry) =>
    entry.kind === "tool"
      ? { ...entry, undoState: "running", undoError: undefined }
      : entry,
  );

  const result = await runUndo(item.undo).catch(
    (error): ToolResult => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  patchTimelineItem(itemId, (entry) =>
    entry.kind === "tool"
      ? {
          ...entry,
          undoState: result.ok ? "done" : "failed",
          undoError: result.ok ? undefined : result.error,
        }
      : entry,
  );

  await persistCurrentChat();
}
