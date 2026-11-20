import fs from "fs-extra";
import path from "path";
import { createHash } from "crypto";
import { pathToFileURL } from "url";
import { assertSkinBuffer, MAX_SKIN_FILE_BYTES } from "../utilities/skin";
import { mutateJsonAtomic } from "../utilities/atomicJson";
import { accountSyncApi } from "../utilities/accountSyncClient";
import type {
  AccountSyncFailure,
  RemoteWardrobeItem,
  WardrobeSyncResult,
} from "@/types/AccountSync";

type Kind = "skin" | "cape";

const KINDS: Kind[] = ["cape", "skin"];
const HASH = /^[a-f0-9]{40}$/;
const MAX_NAME = 64;

export interface LocalWardrobeItem {
  kind: Kind;
  hash: string;
  name: string;
  model: "classic" | "slim" | null;
  cape: string | null;
  updatedAt: number;
  hasFile: boolean;
}

export type WardrobeBase = Record<Kind, Record<string, number>>;

export type WardrobeAction =
  | { type: "upload"; item: LocalWardrobeItem; withData: boolean }
  | { type: "download"; remote: RemoteWardrobeItem }
  | { type: "apply"; remote: RemoteWardrobeItem }
  | { type: "record"; kind: Kind; hash: string; changedAt: number }
  | { type: "deleteLocal"; kind: Kind; hash: string }
  | { type: "deleteRemote"; kind: Kind; hash: string };

type StoredSkin = {
  id?: string;
  hash?: string;
  name?: string;
  model?: string;
  capeId?: string;
  remoteId?: string;
  url?: string;
  updatedAt?: number;
  [key: string]: unknown;
};

type StoredCape = {
  id?: string;
  hash?: string;
  alias?: string;
  remoteId?: string;
  url?: string;
  updatedAt?: number;
  [key: string]: unknown;
};

type StoredIndex = { skins?: StoredSkin[]; capes?: StoredCape[] };

type BaseFile = { version: 1; accounts: Record<string, WardrobeBase> };

function emptyBase(): WardrobeBase {
  return { skin: {}, cape: {} };
}

function sameName(local: string, remote: string, hash: string): boolean {
  return local === remote || local === `${remote}-${hash.slice(0, 6)}`;
}

export function sameMeta(local: LocalWardrobeItem, remote: RemoteWardrobeItem): boolean {
  return (
    sameName(local.name, remote.name, local.hash) &&
    local.model === remote.model &&
    local.cape === remote.cape
  );
}

export function normalizeRemoteItem(value: unknown): RemoteWardrobeItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "skin" && raw.kind !== "cape") return null;
  if (typeof raw.hash !== "string" || !HASH.test(raw.hash)) return null;
  const changedAt = Number(raw.changedAt);
  if (!Number.isFinite(changedAt) || changedAt <= 0) return null;
  return {
    kind: raw.kind,
    hash: raw.hash,
    name: typeof raw.name === "string" ? raw.name.slice(0, MAX_NAME) : raw.hash.slice(0, 12),
    model: raw.kind === "skin" ? (raw.model === "slim" ? "slim" : "classic") : null,
    cape:
      raw.kind === "skin" && typeof raw.cape === "string" && HASH.test(raw.cape) ? raw.cape : null,
    changedAt: Math.floor(changedAt),
  };
}

export function planWardrobeSync(
  local: LocalWardrobeItem[],
  remote: RemoteWardrobeItem[],
  base: WardrobeBase,
): WardrobeAction[] {
  const actions: WardrobeAction[] = [];

  for (const kind of KINDS) {
    const mine = new Map(local.filter((item) => item.kind === kind).map((item) => [item.hash, item]));
    const theirs = new Map(
      remote.filter((item) => item.kind === kind).map((item) => [item.hash, item]),
    );
    const known = base[kind] ?? {};

    for (const [hash, item] of mine) {
      const found = theirs.get(hash);
      const synced = known[hash];

      if (found) {
        if (!item.hasFile) {
          actions.push({ type: "download", remote: found });
        } else if (sameMeta(item, found)) {
          if (synced !== found.changedAt) {
            actions.push({ type: "record", kind, hash, changedAt: found.changedAt });
          }
        } else if (item.updatedAt > found.changedAt) {
          actions.push({ type: "upload", item, withData: false });
        } else {
          actions.push({ type: "apply", remote: found });
        }
        continue;
      }

      if (synced !== undefined && item.updatedAt <= synced) {
        actions.push({ type: "deleteLocal", kind, hash });
      } else if (item.hasFile) {
        actions.push({ type: "upload", item, withData: true });
      }
    }

    for (const [hash, found] of theirs) {
      if (mine.has(hash)) continue;
      actions.push(
        known[hash] !== undefined
          ? { type: "deleteRemote", kind, hash }
          : { type: "download", remote: found },
      );
    }
  }

  return actions;
}

function hashOf(entry: { id?: string; hash?: string }): string | null {
  const hash = entry.hash || entry.id;
  return typeof hash === "string" && HASH.test(hash) ? hash : null;
}

function filePath(skinsDir: string, kind: Kind, hash: string): string {
  return kind === "skin"
    ? path.join(skinsDir, `${hash}.png`)
    : path.join(skinsDir, "capes", `${hash}.png`);
}

function syncableCapes(index: StoredIndex): Set<string> {
  const hashes = new Set<string>();
  for (const cape of index.capes ?? []) {
    const hash = hashOf(cape);
    if (hash && !cape.remoteId) hashes.add(hash);
  }
  return hashes;
}

export async function readLocalWardrobe(
  index: StoredIndex,
  skinsDir: string,
): Promise<LocalWardrobeItem[]> {
  const capes = syncableCapes(index);
  const items: LocalWardrobeItem[] = [];
  const seen = new Set<string>();

  for (const cape of index.capes ?? []) {
    const hash = hashOf(cape);
    if (!hash || cape.remoteId || seen.has(`cape:${hash}`)) continue;
    seen.add(`cape:${hash}`);
    items.push({
      kind: "cape",
      hash,
      name: (cape.alias || hash.slice(0, 12)).slice(0, MAX_NAME),
      model: null,
      cape: null,
      updatedAt: Number(cape.updatedAt) || 0,
      hasFile: await fs.pathExists(filePath(skinsDir, "cape", hash)),
    });
  }

  for (const skin of index.skins ?? []) {
    const hash = hashOf(skin);
    if (!hash || seen.has(`skin:${hash}`)) continue;
    seen.add(`skin:${hash}`);
    items.push({
      kind: "skin",
      hash,
      name: (skin.name || hash.slice(0, 12)).slice(0, MAX_NAME),
      model: skin.model === "slim" ? "slim" : "classic",
      cape: skin.capeId && capes.has(skin.capeId) ? skin.capeId : null,
      updatedAt: Number(skin.updatedAt) || 0,
      hasFile: await fs.pathExists(filePath(skinsDir, "skin", hash)),
    });
  }

  return items;
}

type Meta = { name: string; model: "classic" | "slim" | null; cape: string | null; updatedAt: number };

export function applyWardrobeEdits(
  index: StoredIndex,
  skinsDir: string,
  upserts: Map<string, Meta & { kind: Kind; hash: string }>,
  removals: Set<string>,
): StoredIndex {
  const key = (kind: Kind, hash: string) => `${kind}:${hash}`;
  const removedCapes = new Set(
    [...removals].filter((item) => item.startsWith("cape:")).map((item) => item.slice(5)),
  );

  const capes: StoredCape[] = [];
  const capeHashes = new Set<string>();
  for (const cape of index.capes ?? []) {
    const hash = hashOf(cape);
    if (hash && removals.has(key("cape", hash))) continue;
    const edit = hash ? upserts.get(key("cape", hash)) : undefined;
    capes.push(edit ? { ...cape, alias: edit.name, updatedAt: edit.updatedAt } : cape);
    if (hash) capeHashes.add(hash);
  }
  for (const edit of upserts.values()) {
    if (edit.kind !== "cape" || capeHashes.has(edit.hash)) continue;
    capeHashes.add(edit.hash);
    capes.push({
      id: edit.hash,
      hash: edit.hash,
      alias: edit.name,
      url: pathToFileURL(filePath(skinsDir, "cape", edit.hash)).href,
      updatedAt: edit.updatedAt,
    });
  }

  const remoteCapes = syncableCapes({ capes });
  const capeFor = (current: string | undefined, wanted: string | null) => {
    if (wanted && capeHashes.has(wanted)) return wanted;
    if (current && !remoteCapes.has(current) && !removedCapes.has(current)) return current;
    return undefined;
  };

  const skins: StoredSkin[] = [];
  const skinHashes = new Set<string>();
  for (const skin of index.skins ?? []) {
    const hash = hashOf(skin);
    if (hash && removals.has(key("skin", hash))) continue;
    const edit = hash ? upserts.get(key("skin", hash)) : undefined;
    let next: StoredSkin = skin;
    if (edit) {
      next = {
        ...skin,
        name: sameName(skin.name ?? "", edit.name, edit.hash) ? skin.name : edit.name,
        model: edit.model ?? "classic",
        capeId: capeFor(skin.capeId, edit.cape),
        updatedAt: edit.updatedAt,
      };
    } else if (skin.capeId && removedCapes.has(skin.capeId)) {
      next = { ...skin, capeId: undefined };
    }
    if (next.capeId === undefined) delete next.capeId;
    skins.push(next);
    if (hash) skinHashes.add(hash);
  }
  for (const edit of upserts.values()) {
    if (edit.kind !== "skin" || skinHashes.has(edit.hash)) continue;
    skinHashes.add(edit.hash);
    const cape = capeFor(undefined, edit.cape);
    skins.push({
      id: edit.hash,
      hash: edit.hash,
      name: edit.name,
      model: edit.model ?? "classic",
      url: pathToFileURL(filePath(skinsDir, "skin", edit.hash)).href,
      ...(cape ? { capeId: cape } : {}),
      updatedAt: edit.updatedAt,
    });
  }

  return { ...index, skins, capes };
}

function basePath(launcherPath: string): string {
  return path.join(launcherPath, "sync", "wardrobe.json");
}

async function readBase(launcherPath: string, userId: string): Promise<WardrobeBase> {
  try {
    const file = (await fs.readJSON(basePath(launcherPath), "utf-8")) as BaseFile;
    const base = file?.accounts?.[userId];
    return {
      skin: { ...(base?.skin ?? {}) },
      cape: { ...(base?.cape ?? {}) },
    };
  } catch {
    return emptyBase();
  }
}

async function writeBase(launcherPath: string, userId: string, base: WardrobeBase) {
  await fs.ensureDir(path.dirname(basePath(launcherPath)));
  await mutateJsonAtomic<BaseFile>(basePath(launcherPath), (current) => ({
    version: 1,
    accounts: { ...(current?.accounts ?? {}), [userId]: base },
  }));
}

async function writeVerified(target: string, data: Buffer, hash: string, kind: Kind) {
  if (createHash("sha1").update(data).digest("hex") !== hash) throw new Error("hash_mismatch");
  assertSkinBuffer(data, kind);
  await fs.ensureDir(path.dirname(target));
  const temp = `${target}.sync-${process.pid}`;
  await fs.writeFile(temp, data);
  await fs.move(temp, target, { overwrite: true });
}

const ABORT: AccountSyncFailure[] = ["offline", "unauthorized"];

export async function syncWardrobe(
  launcherPath: string,
  token: string,
  userId: string,
): Promise<WardrobeSyncResult> {
  const listed = await accountSyncApi.listWardrobe(token);
  if (!listed.ok) return { ok: false, reason: listed.reason };
  const remote = (Array.isArray(listed.data?.items) ? listed.data.items : [])
    .map(normalizeRemoteItem)
    .filter((item): item is RemoteWardrobeItem => item !== null);

  const skinsDir = path.join(launcherPath, "skins");
  const indexPath = path.join(skinsDir, "index.json");
  const index: StoredIndex = await fs
    .readJSON(indexPath, "utf-8")
    .catch(() => ({ skins: [], capes: [] }));
  const base = await readBase(launcherPath, userId);
  const local = await readLocalWardrobe(index, skinsDir);
  const byKey = new Map(local.map((item) => [`${item.kind}:${item.hash}`, item]));

  const upserts = new Map<string, Meta & { kind: Kind; hash: string }>();
  const removals = new Set<string>();
  const adopt = (item: RemoteWardrobeItem) => {
    upserts.set(`${item.kind}:${item.hash}`, {
      kind: item.kind,
      hash: item.hash,
      name: item.name,
      model: item.model,
      cape: item.cape,
      updatedAt: item.changedAt,
    });
    base[item.kind][item.hash] = item.changedAt;
  };

  let failure: AccountSyncFailure | null = null;

  for (const action of planWardrobeSync(local, remote, base)) {
    if (failure) break;

    if (action.type === "record") {
      base[action.kind][action.hash] = action.changedAt;
    } else if (action.type === "apply") {
      adopt(action.remote);
    } else if (action.type === "download") {
      const { kind, hash } = action.remote;
      const texture = await accountSyncApi.wardrobeTexture(token, kind, hash, MAX_SKIN_FILE_BYTES);
      if (!texture.ok) {
        if (ABORT.includes(texture.reason)) failure = texture.reason;
        continue;
      }
      try {
        await writeVerified(filePath(skinsDir, kind, hash), Buffer.from(texture.data), hash, kind);
        adopt(action.remote);
      } catch (error) {
        console.warn(`Wardrobe sync skipped ${kind} ${hash}:`, error);
      }
    } else if (action.type === "upload") {
      const { item } = action;
      const body: Record<string, unknown> = {
        name: item.name,
        model: item.model,
        cape: item.cape,
        changedAt: item.updatedAt || 1,
      };
      const withData = async () => {
        const data = await fs.readFile(filePath(skinsDir, item.kind, item.hash));
        return { ...body, data: data.toString("base64") };
      };
      let sent = await accountSyncApi.putWardrobeItem(
        token,
        item.kind,
        item.hash,
        action.withData ? await withData() : body,
      );
      if (!sent.ok && sent.reason === "data_required") {
        sent = await accountSyncApi.putWardrobeItem(token, item.kind, item.hash, await withData());
      }
      if (!sent.ok) {
        if (ABORT.includes(sent.reason)) failure = sent.reason;
        continue;
      }
      const stored = normalizeRemoteItem(sent.data);
      if (!stored) continue;
      if (stored.changedAt > (item.updatedAt || 1) && !sameMeta(item, stored)) adopt(stored);
      else base[item.kind][item.hash] = stored.changedAt;
    } else if (action.type === "deleteLocal") {
      removals.add(`${action.kind}:${action.hash}`);
      delete base[action.kind][action.hash];
      if (byKey.get(`${action.kind}:${action.hash}`)?.hasFile) {
        await fs.remove(filePath(skinsDir, action.kind, action.hash)).catch(() => {});
      }
    } else {
      const removed = await accountSyncApi.deleteWardrobeItem(token, action.kind, action.hash);
      if (removed.ok) delete base[action.kind][action.hash];
      else if (ABORT.includes(removed.reason)) failure = removed.reason;
    }
  }

  const changed = upserts.size > 0 || removals.size > 0;
  if (changed) {
    await fs.ensureDir(skinsDir);
    await mutateJsonAtomic<StoredIndex>(indexPath, (current) =>
      applyWardrobeEdits(current ?? { skins: [], capes: [] }, skinsDir, upserts, removals),
    );
  }
  await writeBase(launcherPath, userId, base);

  return failure ? { ok: false, reason: failure } : { ok: true, changed };
}

