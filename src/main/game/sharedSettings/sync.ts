import fs from "fs-extra";
import path from "path";
import { createHash } from "crypto";
import { deserialize } from "@xmcl/nbt";
import type { IServer } from "@/types/ServersList";
import {
  SHARED_GROUPS,
  type SharedGroup,
  type SharedGroupBlock,
  type SharedInstanceChoice,
  type SharedInstanceRef,
  type SharedInstanceStatus,
  type SharedOverview,
  type SharedProfileSummary,
} from "@/types/SharedSettings";
import { readNBT, writeNBT } from "../../utilities/nbt";
import { readJSONFromArchive } from "../../utilities/archiver";
import { copyContentFile } from "../../utilities/contentStore";
import { isVersionRunning } from "../../utilities/worldBackups";
import { gameRuntime } from "../../utilities/runtime";
import { journal } from "../../journal/journal";
import {
  gameResourceFormat,
  legacyPackFormat,
  packSupportsGame,
} from "../modTranslations/optionsTxt";
import { optionsEra } from "./catalog";
import {
  applySharedOptions,
  captureSharedOptions,
  optionsBaseline,
  restoreOptions,
} from "./optionsMerge";
import { getOption, parseOptionsText } from "./optionsText";
import {
  applyServers,
  captureServers,
  restoreServers,
  serverMarks,
} from "./serverMerge";
import { captureHistory, parseHistory, serializeHistory } from "./historyMerge";
import {
  applyPackList,
  capturePacks,
  enabledPlayerPacks,
  restorePackList,
} from "./packList";
import {
  backupPath,
  HISTORY_FILE,
  HOTBAR_FILE,
  OPTIONS_FILE,
  PACKS_FOLDER,
  profilePath,
  readInstanceState,
  readProfile,
  SERVERS_FILE,
  withProfileLock,
  writeFileAtomic,
  writeInstanceState,
  writeProfile,
  type InstanceState,
  type ProfileData,
} from "./store";

type Mode = "session" | "adopt" | "first";
type Phase = "launch" | "exit" | "configure";

interface Shared {
  profile: ProfileData;
  servers: IServer[];
  history: string[];
}

const OPTION_GROUPS: readonly SharedGroup[] = ["controls", "video"];
const LEGACY_HOTBAR_DATA_VERSION = 1343;
const EARLY_DATA_VERSIONS: Record<string, number> = {
  "1.13": 1519,
  "1.13.1": 1628,
  "1.13.2": 1631,
};

function emptyState(connected: boolean): InstanceState {
  return { v: 1, connected, off: [], adopt: false, synced: false };
}

function blockedFor(
  ref: SharedInstanceRef,
): Partial<Record<SharedGroup, SharedGroupBlock>> {
  return ref.shareCode ? { servers: "share" } : {};
}

function activeGroups(
  state: InstanceState,
  ref: SharedInstanceRef,
): Set<SharedGroup> {
  if (!state.connected) return new Set();
  const blocked = blockedFor(ref);
  return new Set(
    SHARED_GROUPS.filter(
      (group) => !state.off.includes(group) && !blocked[group],
    ),
  );
}

function optionGroupsOf(groups: ReadonlySet<SharedGroup>): Set<SharedGroup> {
  return new Set(OPTION_GROUPS.filter((group) => groups.has(group)));
}

function inInstance(ref: SharedInstanceRef, ...parts: string[]): string {
  return path.join(ref.versionPath, ...parts);
}

async function readText(file: string): Promise<string | null> {
  return fs.readFile(file, "utf8").catch(() => null);
}

async function sha1Of(file: string): Promise<string | null> {
  const data = await fs.readFile(file).catch(() => null);
  return data ? createHash("sha1").update(data).digest("hex") : null;
}

async function readServers(file: string): Promise<IServer[] | null> {
  try {
    return await readNBT(file);
  } catch {
    return null;
  }
}

async function hotbarDataVersion(file: string): Promise<number | null> {
  try {
    const root = await deserialize<{ DataVersion?: unknown }>(
      new Uint8Array(await fs.readFile(file)),
    );
    return typeof root?.DataVersion === "number"
      ? root.DataVersion
      : LEGACY_HOTBAR_DATA_VERSION;
  } catch {
    return null;
  }
}

async function readClientJson(ref: SharedInstanceRef): Promise<unknown> {
  return readJSONFromArchive<unknown>(
    inInstance(ref, `${ref.mcVersion}.jar`),
    "version.json",
  ).catch(() => null);
}

async function instanceDataVersion(
  ref: SharedInstanceRef,
  optionsText: string | null,
): Promise<number | null> {
  const stored = getOption(parseOptionsText(optionsText), "version")?.trim();
  if (stored && /^\d+$/.test(stored)) return Number(stored);
  if (optionsEra(ref.mcVersion) === "legacy") return null;
  const client = (await readClientJson(ref)) as {
    world_version?: unknown;
  } | null;
  if (typeof client?.world_version === "number") return client.world_version;
  return EARLY_DATA_VERSIONS[ref.mcVersion] ?? null;
}

async function gameFormatOf(ref: SharedInstanceRef): Promise<number | null> {
  if (legacyPackFormat(ref.mcVersion) !== null) {
    return gameResourceFormat(null, ref.mcVersion);
  }
  return gameResourceFormat(await readClientJson(ref), ref.mcVersion);
}

async function fileSize(file: string): Promise<number | null> {
  const stats = await fs.stat(file).catch(() => null);
  return stats?.isFile() ? stats.size : null;
}

async function shareablePacks(
  ref: SharedInstanceRef,
  names: string[],
): Promise<Set<string>> {
  const result = new Set<string>();
  for (const name of names) {
    if (!/\.zip$/i.test(name)) continue;
    if ((await fileSize(inInstance(ref, PACKS_FOLDER, name))) !== null)
      result.add(name);
  }
  return result;
}

async function storeProfilePack(
  ref: SharedInstanceRef,
  name: string,
): Promise<boolean> {
  const source = inInstance(ref, PACKS_FOLDER, name);
  const target = profilePath(PACKS_FOLDER, name);
  const size = await fileSize(source);
  if (size === null) return false;
  if ((await fileSize(target)) === size) return true;
  try {
    await fs.ensureDir(path.dirname(target));
    await fs.remove(target);
    await fs.link(source, target).catch(() => fs.copy(source, target));
    return true;
  } catch {
    return false;
  }
}

async function ensureInstancePack(
  ref: SharedInstanceRef,
  name: string,
): Promise<boolean> {
  const source = profilePath(PACKS_FOLDER, name);
  const target = inInstance(ref, PACKS_FOLDER, name);
  const size = await fileSize(source);
  if (size === null) return false;
  const existing = await fs.stat(target).catch(() => null);
  if (existing) return existing.isFile() && existing.size === size;
  try {
    await copyContentFile(source, target);
    return true;
  } catch {
    return false;
  }
}

async function loadShared(): Promise<Shared> {
  return {
    profile: await readProfile(),
    servers: (await readServers(profilePath(SERVERS_FILE))) ?? [],
    history: parseHistory(await readText(profilePath(HISTORY_FILE))),
  };
}

async function saveShared(before: string, shared: Shared): Promise<void> {
  const initial = JSON.parse(before) as Shared;
  if (JSON.stringify(initial.profile) !== JSON.stringify(shared.profile)) {
    await writeProfile(shared.profile);
  }
  if (JSON.stringify(initial.servers) !== JSON.stringify(shared.servers)) {
    await writeNBT(shared.servers, profilePath(SERVERS_FILE));
  }
  if (JSON.stringify(initial.history) !== JSON.stringify(shared.history)) {
    await writeFileAtomic(
      profilePath(HISTORY_FILE),
      serializeHistory(shared.history),
    );
  }
}

async function takeBackup(ref: SharedInstanceRef): Promise<void> {
  const dir = backupPath(ref.versionPath);
  if (await fs.pathExists(dir)) return;
  await fs.ensureDir(dir);
  for (const name of [OPTIONS_FILE, SERVERS_FILE, HOTBAR_FILE, HISTORY_FILE]) {
    const source = inInstance(ref, name);
    if (await fs.pathExists(source))
      await fs.copy(source, path.join(dir, name));
  }
}

async function captureInstance(
  ref: SharedInstanceRef,
  state: InstanceState,
  shared: Shared,
  groups: ReadonlySet<SharedGroup>,
  mode: Mode,
): Promise<void> {
  const modeFor = (hasBaseline: boolean): Mode =>
    mode === "session" && !hasBaseline ? "first" : mode;
  const optionsText = await readText(inInstance(ref, OPTIONS_FILE));
  const optionGroups = optionGroupsOf(groups);

  const optionsMode = modeFor(state.options !== undefined);
  if (optionGroups.size && optionsMode !== "first") {
    Object.assign(
      shared.profile.options,
      captureSharedOptions(
        optionsText,
        state.options ?? null,
        shared.profile.options,
        {
          mcVersion: ref.mcVersion,
          loader: ref.loader,
          groups: optionGroups,
          dataVersion: null,
        },
        optionsMode,
        Date.now(),
      ),
    );
  }

  if (groups.has("servers")) {
    const current = await readServers(inInstance(ref, SERVERS_FILE));
    if (current) {
      const next = captureServers(
        current,
        state.servers ?? null,
        { profile: shared.servers, local: state.localServers ?? [] },
        modeFor(state.servers !== undefined),
      );
      shared.servers = next.profile;
      state.localServers = next.local;
    }
  }

  if (groups.has("packs")) {
    const current = enabledPlayerPacks(optionsText, ref.mcVersion);
    if (current) {
      const shareable = await shareablePacks(ref, current);
      const next = capturePacks(
        current,
        state.packs ?? null,
        state.appliedPacks ?? [],
        { profile: shared.profile.packs, local: state.localPacks ?? [] },
        modeFor(state.packs !== undefined),
        (name) => shareable.has(name),
      );
      const failed: string[] = [];
      for (const name of next.profile) {
        if (shared.profile.packs.includes(name)) continue;
        if (!(await storeProfilePack(ref, name))) failed.push(name);
      }
      const packs = next.profile.filter((name) => !failed.includes(name));
      for (const name of shared.profile.packs) {
        if (!packs.includes(name)) {
          await fs
            .remove(profilePath(PACKS_FOLDER, name))
            .catch(() => undefined);
        }
      }
      shared.profile.packs = packs;
      state.localPacks = [...next.local, ...failed];
    }
  }

  const hotbarMode = modeFor(state.hotbar !== undefined);
  if (groups.has("hotbars") && hotbarMode !== "first") {
    const file = inInstance(ref, HOTBAR_FILE);
    const hash = await sha1Of(file);
    const changed =
      hotbarMode === "adopt"
        ? shared.profile.hotbarDataVersion === null
        : hash !== state.hotbar;
    if (hash && changed) {
      const version = await hotbarDataVersion(file);
      const sharedVersion = shared.profile.hotbarDataVersion;
      if (
        version !== null &&
        (sharedVersion === null || version >= sharedVersion)
      ) {
        await writeFileAtomic(
          profilePath(HOTBAR_FILE),
          await fs.readFile(file),
        );
        shared.profile.hotbarDataVersion = version;
      }
    }
  }

  if (groups.has("history")) {
    shared.history = captureHistory(
      parseHistory(await readText(inInstance(ref, HISTORY_FILE))),
      state.history ?? null,
      shared.history,
      modeFor(state.history !== undefined),
    );
  }
}

async function applyInstance(
  ref: SharedInstanceRef,
  state: InstanceState,
  shared: Shared,
  groups: ReadonlySet<SharedGroup>,
): Promise<void> {
  const optionsPath = inInstance(ref, OPTIONS_FILE);
  const before = await readText(optionsPath);
  const dataVersion = await instanceDataVersion(ref, before);
  const optionGroups = optionGroupsOf(groups);
  let text = before ?? "";

  if (optionGroups.size) {
    const result = applySharedOptions(before, shared.profile.options, {
      mcVersion: ref.mcVersion,
      loader: ref.loader,
      groups: optionGroups,
      dataVersion,
    });
    text = result.text;
    state.options = result.baseline;
  } else {
    delete state.options;
  }

  if (groups.has("packs")) {
    const format = shared.profile.packs.length ? await gameFormatOf(ref) : null;
    const compatible: string[] = [];
    for (const name of format === null ? [] : shared.profile.packs) {
      const mcmeta = await readJSONFromArchive<unknown>(
        profilePath(PACKS_FOLDER, name),
        "pack.mcmeta",
      ).catch(() => null);
      if (!mcmeta || !packSupportsGame(mcmeta, format!, ref.mcVersion))
        continue;
      if (await ensureInstancePack(ref, name)) compatible.push(name);
    }
    text = applyPackList(
      text || null,
      ref.mcVersion,
      compatible,
      new Set(shared.profile.packs),
    ).text;
    state.appliedPacks = compatible;
    state.packs = enabledPlayerPacks(text, ref.mcVersion) ?? [];
  } else {
    delete state.packs;
    delete state.appliedPacks;
    delete state.localPacks;
  }

  if (text !== (before ?? "")) await writeFileAtomic(optionsPath, text);

  if (groups.has("servers")) {
    const file = inInstance(ref, SERVERS_FILE);
    const current = await readServers(file);
    if (current) {
      const next = applyServers(current, {
        profile: shared.servers,
        local: state.localServers ?? [],
      });
      if (JSON.stringify(next) !== JSON.stringify(current))
        await writeNBT(next, file);
      state.servers = serverMarks(next);
    }
  } else {
    delete state.servers;
    delete state.localServers;
  }

  if (groups.has("hotbars")) {
    const file = inInstance(ref, HOTBAR_FILE);
    const sharedVersion = shared.profile.hotbarDataVersion;
    if (
      sharedVersion !== null &&
      dataVersion !== null &&
      dataVersion >= sharedVersion
    ) {
      const source = profilePath(HOTBAR_FILE);
      const sourceHash = await sha1Of(source);
      if (sourceHash && sourceHash !== (await sha1Of(file))) {
        await writeFileAtomic(file, await fs.readFile(source));
      }
    }
    state.hotbar = await sha1Of(file);
  } else {
    delete state.hotbar;
  }

  if (groups.has("history")) {
    const file = inInstance(ref, HISTORY_FILE);
    const current = parseHistory(await readText(file));
    if (
      shared.history.length &&
      JSON.stringify(current) !== JSON.stringify(shared.history)
    ) {
      await writeFileAtomic(file, serializeHistory(shared.history));
    }
    state.history = shared.history.length ? shared.history : current;
  } else {
    delete state.history;
  }
}

async function rebaseline(
  ref: SharedInstanceRef,
  state: InstanceState,
  groups: ReadonlySet<SharedGroup>,
): Promise<void> {
  const optionsText = await readText(inInstance(ref, OPTIONS_FILE));
  const optionGroups = optionGroupsOf(groups);
  if (optionGroups.size)
    state.options = optionsBaseline(optionsText, optionGroups);
  if (groups.has("packs")) {
    state.packs = enabledPlayerPacks(optionsText, ref.mcVersion) ?? state.packs;
  }
  if (groups.has("servers")) {
    const current = await readServers(inInstance(ref, SERVERS_FILE));
    if (current) state.servers = serverMarks(current);
  }
  if (groups.has("hotbars"))
    state.hotbar = await sha1Of(inInstance(ref, HOTBAR_FILE));
  if (groups.has("history")) {
    state.history = parseHistory(await readText(inInstance(ref, HISTORY_FILE)));
  }
}

async function runSync(
  ref: SharedInstanceRef,
  state: InstanceState,
  phase: Phase,
): Promise<void> {
  const groups = activeGroups(state, ref);
  const shared = await loadShared();
  const before = JSON.stringify(shared);
  const mode: Mode = state.synced ? "session" : state.adopt ? "adopt" : "first";

  if (!state.synced) await takeBackup(ref);
  await captureInstance(ref, state, shared, groups, mode);
  if (phase === "exit") await rebaseline(ref, state, groups);
  else await applyInstance(ref, state, shared, groups);

  state.synced = true;
  state.adopt = false;
  state.mc = ref.mcVersion;
  state.shareLinked = Boolean(ref.shareCode);
  await saveShared(before, shared);
  await writeInstanceState(ref.versionPath, state);
}

async function restoreGroups(
  ref: SharedInstanceRef,
  state: InstanceState,
  groups: ReadonlySet<SharedGroup>,
): Promise<void> {
  const optionsPath = inInstance(ref, OPTIONS_FILE);
  const before = await readText(optionsPath);
  const backupOptions = await readText(
    backupPath(ref.versionPath, OPTIONS_FILE),
  );
  let text: string | null = before;

  const optionGroups = optionGroupsOf(groups);
  if (optionGroups.size) {
    text = restoreOptions(text, backupOptions, optionGroups).text;
    delete state.options;
  }
  if (groups.has("packs")) {
    text = restorePackList(
      text,
      backupOptions,
      ref.mcVersion,
      state.appliedPacks ?? [],
      (name) => fs.existsSync(inInstance(ref, PACKS_FOLDER, name)),
    ).text;
    delete state.packs;
    delete state.appliedPacks;
    delete state.localPacks;
  }
  if (text !== null && text !== before)
    await writeFileAtomic(optionsPath, text);

  if (groups.has("servers")) {
    const backup = backupPath(ref.versionPath, SERVERS_FILE);
    if (await fs.pathExists(backup)) {
      const own = await readServers(backup);
      const file = inInstance(ref, SERVERS_FILE);
      const current = (await readServers(file)) ?? [];
      if (own) await writeNBT(restoreServers(current, own), file);
    }
    delete state.servers;
    delete state.localServers;
  }

  for (const [group, name] of [
    ["hotbars", HOTBAR_FILE],
    ["history", HISTORY_FILE],
  ] as const) {
    if (!groups.has(group)) continue;
    const backup = backupPath(ref.versionPath, name);
    if (await fs.pathExists(backup)) {
      await writeFileAtomic(inInstance(ref, name), await fs.readFile(backup));
    }
    if (group === "hotbars") delete state.hotbar;
    else delete state.history;
  }
}

function statusOf(
  ref: SharedInstanceRef,
  state: InstanceState | null,
  hasBackup: boolean,
): SharedInstanceStatus {
  return {
    connected: state?.connected === true,
    pending: state?.connected === true && !state.synced,
    off: state?.off ?? [],
    blocked: blockedFor(ref),
    hasBackup,
  };
}

export async function sharedStatus(
  ref: SharedInstanceRef,
): Promise<SharedInstanceStatus> {
  const state = await readInstanceState(ref.versionPath);
  return statusOf(ref, state, await fs.pathExists(backupPath(ref.versionPath)));
}

export async function configureShared(
  ref: SharedInstanceRef,
  choice: SharedInstanceChoice,
): Promise<SharedInstanceStatus> {
  return withProfileLock(async () => {
    if (isVersionRunning(ref.versionPath))
      throw new Error("instance is running");
    const state =
      (await readInstanceState(ref.versionPath)) ?? emptyState(false);
    const previous = state.synced
      ? activeGroups(state, ref)
      : new Set<SharedGroup>();

    if (!choice.connected) {
      if (previous.size) await restoreGroups(ref, state, previous);
      state.connected = false;
      state.synced = false;
      state.adopt = false;
      await writeInstanceState(ref.versionPath, state);
    } else {
      if (!state.connected) {
        state.connected = true;
        state.adopt = true;
        state.synced = false;
      }
      state.off = SHARED_GROUPS.filter((group) => choice.off.includes(group));
      const next = activeGroups(state, ref);
      const turnedOff = new Set(
        [...previous].filter((group) => !next.has(group)),
      );
      if (turnedOff.size) await restoreGroups(ref, state, turnedOff);
      await runSync(ref, state, "configure");
    }

    journal.info("shared-settings", "instance configured", {
      connected: state.connected,
      off: state.off,
    });
    return statusOf(
      ref,
      state,
      await fs.pathExists(backupPath(ref.versionPath)),
    );
  });
}

export async function markNewInstance(versionPath: string): Promise<void> {
  await withProfileLock(async () => {
    if (await readInstanceState(versionPath)) return;
    const profile = await readProfile();
    if (!profile.autoConnect) return;
    await writeInstanceState(versionPath, emptyState(true));
  });
}

export async function syncBeforeLaunch(ref: SharedInstanceRef): Promise<void> {
  await withProfileLock(async () => {
    const state = await readInstanceState(ref.versionPath);
    if (!state?.connected || isVersionRunning(ref.versionPath)) return;
    const started = Date.now();
    await runSync(ref, state, "launch");
    journal.info("shared-settings", "applied before launch", {
      groups: [...activeGroups(state, ref)],
      ms: Date.now() - started,
    });
  });
}

export async function captureAfterExit(ref: SharedInstanceRef): Promise<void> {
  await withProfileLock(async () => {
    const state = await readInstanceState(ref.versionPath);
    if (!state?.connected || !state.synced || isVersionRunning(ref.versionPath))
      return;
    await runSync(ref, state, "exit");
  });
}

export function captureWhenClosed(
  versionName: string,
  instance: number,
  ref: SharedInstanceRef,
): void {
  const onClose = (event: { versionName: string; instance: number }) => {
    if (event.versionName !== versionName || event.instance !== instance)
      return;
    gameRuntime.off("close", onClose);
    void captureAfterExit(ref).catch((error) =>
      journal.warn("shared-settings", "capture after exit failed", {
        error: String(error),
      }),
    );
  };
  gameRuntime.on("close", onClose);
}

export async function noteServersWritten(file: string): Promise<void> {
  if (path.basename(file) !== SERVERS_FILE) return;
  const versionPath = path.dirname(file);
  await withProfileLock(async () => {
    const state = await readInstanceState(versionPath);
    if (
      !state?.connected ||
      !state.synced ||
      state.shareLinked ||
      state.off.includes("servers") ||
      state.servers === undefined ||
      isVersionRunning(versionPath)
    ) {
      return;
    }
    const current = await readServers(file);
    if (!current) return;
    const shared = await loadShared();
    const before = JSON.stringify(shared);
    const next = captureServers(
      current,
      state.servers,
      { profile: shared.servers, local: state.localServers ?? [] },
      "session",
    );
    shared.servers = next.profile;
    state.localServers = next.local;
    state.servers = serverMarks(current);
    await saveShared(before, shared);
    await writeInstanceState(versionPath, state);
  });
}

async function summary(profile: ProfileData): Promise<SharedProfileSummary> {
  return {
    autoConnect: profile.autoConnect,
    options: Object.keys(profile.options).length,
    servers: ((await readServers(profilePath(SERVERS_FILE))) ?? []).length,
    packs: profile.packs.length,
    hotbars: profile.hotbarDataVersion !== null,
    history: parseHistory(await readText(profilePath(HISTORY_FILE))).length,
  };
}

export async function sharedOverview(
  versionPaths: string[],
): Promise<SharedOverview> {
  const connected: string[] = [];
  for (const versionPath of versionPaths) {
    if ((await readInstanceState(versionPath))?.connected)
      connected.push(versionPath);
  }
  return { profile: await summary(await readProfile()), connected };
}

export async function setAutoConnect(
  value: boolean,
): Promise<SharedProfileSummary> {
  return withProfileLock(async () => {
    const profile = await readProfile();
    profile.autoConnect = value;
    await writeProfile(profile);
    return summary(profile);
  });
}
