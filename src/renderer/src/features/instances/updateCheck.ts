import { atom, getDefaultStore } from "jotai";
import { IModpack } from "@/types/Backend";
import { ILocalAccount } from "@/types/Account";
import { IVersionConf } from "@/types/IVersion";
import { isOwner } from "@renderer/utilities/versionPure";
import { UpdateSummary, buildUpdateSummary } from "./updateSummary";

export type InstanceUpdateState = "sync" | "behind" | "ahead";

export const instanceUpdatesAtom = atom<Record<string, InstanceUpdateState>>(
  {},
);

export const instanceUpdateSummariesAtom = atom<Record<string, UpdateSummary>>(
  {},
);

export const expandedUpdateKeyAtom = atom<string | null>(null);

export function requestUpdateDetails(key: string): void {
  getDefaultStore().set(expandedUpdateKeyAtom, key);
}

export function consumeUpdateDetailsRequest(key: string): boolean {
  const store = getDefaultStore();
  if (store.get(expandedUpdateKeyAtom) !== key) return false;

  store.set(expandedUpdateKeyAtom, null);
  return true;
}

export function isUpdateCheckable(
  local: Pick<IVersionConf, "shareCode" | "owner">,
  account: ILocalAccount | null | undefined,
): boolean {
  return !!local.shareCode && isOwner(local.owner, account ?? undefined);
}

export function compareBuilds(
  local: IVersionConf,
  modpack: Pick<IModpack, "build">,
): InstanceUpdateState {
  const remote = typeof modpack.build === "number" ? modpack.build : 0;
  const current = typeof local.build === "number" ? local.build : 0;

  if (remote > current) return "behind";
  if (local.downloadedVersion && remote < current) return "ahead";

  return "sync";
}

export function setInstanceUpdate(key: string, state: InstanceUpdateState) {
  const store = getDefaultStore();
  const current = store.get(instanceUpdatesAtom);

  if (current[key] === state) return;

  store.set(instanceUpdatesAtom, { ...current, [key]: state });
}

export function setInstanceUpdateSummary(
  key: string,
  summary: UpdateSummary | null,
): void {
  const store = getDefaultStore();
  const current = store.get(instanceUpdateSummariesAtom);

  if (!summary) {
    if (!(key in current)) return;

    const next = { ...current };
    delete next[key];
    store.set(instanceUpdateSummariesAtom, next);
    return;
  }

  store.set(instanceUpdateSummariesAtom, { ...current, [key]: summary });
}

const CHECK_TTL_MS = 5 * 60 * 1000;

const checkedAt = new Map<string, number>();

export function checkFingerprint(
  key: string,
  local: Pick<IVersionConf, "shareCode" | "build">,
  identity?: string | null,
): string {
  return `${key}|${local.shareCode ?? ""}|${local.build ?? 0}|${identity ?? ""}`;
}

export function claimUpdateCheck(fingerprint: string, now = Date.now()): boolean {
  const last = checkedAt.get(fingerprint);
  if (last !== undefined && now - last < CHECK_TTL_MS) return false;

  checkedAt.set(fingerprint, now);
  return true;
}

export function releaseUpdateCheck(fingerprint: string): void {
  checkedAt.delete(fingerprint);
}

let updatesIdentity: string | null | undefined;

export function claimUpdatesForAccount(identity: string | null): boolean {
  if (updatesIdentity === identity) return false;

  forgetInstanceUpdates();
  updatesIdentity = identity;

  return true;
}

export function forgetInstanceUpdates(key?: string): void {
  const store = getDefaultStore();
  const updates = store.get(instanceUpdatesAtom);

  if (!key) {
    checkedAt.clear();
    updatesIdentity = undefined;
    if (Object.keys(updates).length > 0) store.set(instanceUpdatesAtom, {});
    if (Object.keys(store.get(instanceUpdateSummariesAtom)).length > 0) {
      store.set(instanceUpdateSummariesAtom, {});
    }
    if (store.get(expandedUpdateKeyAtom) !== null) {
      store.set(expandedUpdateKeyAtom, null);
    }
    return;
  }

  for (const fingerprint of [...checkedAt.keys()]) {
    if (fingerprint.startsWith(`${key}|`)) checkedAt.delete(fingerprint);
  }

  if (key in updates) {
    const next = { ...updates };
    delete next[key];
    store.set(instanceUpdatesAtom, next);
  }

  setInstanceUpdateSummary(key, null);
  if (store.get(expandedUpdateKeyAtom) === key) {
    store.set(expandedUpdateKeyAtom, null);
  }
}

export function retainInstanceUpdates(keys: Iterable<string>): void {
  const kept = new Set(keys);
  const store = getDefaultStore();
  const updates = store.get(instanceUpdatesAtom);
  const summaries = store.get(instanceUpdateSummariesAtom);

  const staleUpdates = Object.keys(updates).filter((key) => !kept.has(key));
  const staleSummaries = Object.keys(summaries).filter((key) => !kept.has(key));

  if (staleUpdates.length > 0) {
    const next = { ...updates };
    for (const key of staleUpdates) delete next[key];
    store.set(instanceUpdatesAtom, next);
  }

  if (staleSummaries.length > 0) {
    const next = { ...summaries };
    for (const key of staleSummaries) delete next[key];
    store.set(instanceUpdateSummariesAtom, next);
  }

  const expanded = store.get(expandedUpdateKeyAtom);
  if (expanded !== null && !kept.has(expanded)) {
    store.set(expandedUpdateKeyAtom, null);
  }
}

export function recordModpackComparison(
  key: string,
  local: IVersionConf,
  modpack: Pick<IModpack, "build" | "conf">,
): InstanceUpdateState {
  const state = compareBuilds(local, modpack);

  setInstanceUpdate(key, state);
  setInstanceUpdateSummary(
    key,
    state === "behind" && modpack.conf
      ? buildUpdateSummary(local, modpack.conf)
      : null,
  );

  return state;
}
