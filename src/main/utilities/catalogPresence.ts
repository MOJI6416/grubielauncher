import { createHash } from "crypto";
import pLimit from "p-limit";
import { curseForgeFingerprint } from "./cfFingerprint";
import { isSafeRemoteUrl } from "./safeUrl";
import type {
  ICatalogPresenceItem,
  ICatalogPresenceResult,
} from "@/types/ModManager";

export async function downloadCapped(
  url: string,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!isSafeRemoteUrl(url)) return null;

  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) return null;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export type PresenceItem = ICatalogPresenceItem;
export type PresenceResult = ICatalogPresenceResult;

export interface PresenceDeps {
  modrinthHashes: (sha1s: string[]) => Promise<Set<string> | null>;
  curseforgeFingerprints: (
    fingerprints: number[],
  ) => Promise<Set<number> | null>;
  readFile: (path: string) => Promise<Buffer>;
  download: (url: string, maxBytes: number) => Promise<Buffer | null>;
  now?: () => number;
}

const SHA1 = /^[0-9a-f]{40}$/;
const MODRINTH_BATCH = 500;
const MAX_REMOTE_BYTES = 256 * 1024 * 1024;
const READ_CONCURRENCY = 4;
const KNOWN_TTL_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_TTL_MS = 6 * 60 * 60 * 1000;

const verdicts = new Map<string, { known: boolean; at: number }>();

export function forgetCatalogPresence(): void {
  verdicts.clear();
}

function sha1Of(data: Buffer): string {
  return createHash("sha1").update(data).digest("hex");
}

interface Resolved {
  key: string;
  sha1: string;
  fingerprint?: number;
  item: PresenceItem;
  failed?: boolean;
}

export async function catalogPresence(
  items: PresenceItem[],
  deps: PresenceDeps,
): Promise<PresenceResult> {
  const now = deps.now ?? Date.now;
  const limit = pLimit(READ_CONCURRENCY);

  const resolved: Resolved[] = await Promise.all(
    items.map((item) =>
      limit(async (): Promise<Resolved> => {
        const given = (item.sha1 ?? "").toLowerCase();
        if (SHA1.test(given)) return { key: item.key, sha1: given, item };
        try {
          const data = item.path
            ? await deps.readFile(item.path)
            : item.url
              ? await deps.download(item.url, MAX_REMOTE_BYTES)
              : null;
          if (!data) return { key: item.key, sha1: "", item, failed: true };
          return {
            key: item.key,
            sha1: sha1Of(data),
            fingerprint: curseForgeFingerprint(data),
            item,
          };
        } catch {
          return { key: item.key, sha1: "", item, failed: true };
        }
      }),
    ),
  );

  const known = new Set<string>();
  const unknown = new Set<string>();
  const fresh = (entry: { known: boolean; at: number }) =>
    now() - entry.at < (entry.known ? KNOWN_TTL_MS : UNKNOWN_TTL_MS);

  const pending = resolved.filter((entry) => {
    if (entry.failed) return false;
    const cached = verdicts.get(entry.sha1);
    if (!cached || !fresh(cached)) return true;
    (cached.known ? known : unknown).add(entry.sha1);
    return false;
  });

  const hashes = [...new Set(pending.map((entry) => entry.sha1))];
  let modrinthFailed = false;
  for (let start = 0; start < hashes.length; start += MODRINTH_BATCH) {
    const found = await deps.modrinthHashes(
      hashes.slice(start, start + MODRINTH_BATCH),
    );
    if (!found) {
      modrinthFailed = true;
      break;
    }
    for (const hash of found) known.add(hash);
  }

  const notOnModrinth = pending.filter((entry) => !known.has(entry.sha1));
  await Promise.all(
    notOnModrinth.map((entry) =>
      limit(async () => {
        if (entry.fingerprint !== undefined) return;
        try {
          const data = entry.item.path
            ? await deps.readFile(entry.item.path)
            : entry.item.url
              ? await deps.download(entry.item.url, MAX_REMOTE_BYTES)
              : null;
          if (data) entry.fingerprint = curseForgeFingerprint(data);
        } catch {
          return;
        }
      }),
    ),
  );

  const fingerprints = [
    ...new Set(
      notOnModrinth
        .map((entry) => entry.fingerprint)
        .filter((value): value is number => value !== undefined),
    ),
  ];
  const onCurseForge =
    fingerprints.length > 0
      ? await deps.curseforgeFingerprints(fingerprints)
      : new Set<number>();
  const curseforgeFailed = onCurseForge === null;

  const result: PresenceResult = { unknown: [], unchecked: [] };
  for (const entry of resolved) {
    if (entry.failed) {
      result.unchecked.push(entry.key);
      continue;
    }
    if (known.has(entry.sha1)) continue;
    if (
      entry.fingerprint !== undefined &&
      onCurseForge?.has(entry.fingerprint)
    ) {
      verdicts.set(entry.sha1, { known: true, at: now() });
      continue;
    }
    if (unknown.has(entry.sha1)) {
      result.unknown.push(entry.key);
      continue;
    }
    if (modrinthFailed || curseforgeFailed || entry.fingerprint === undefined) {
      result.unchecked.push(entry.key);
      continue;
    }
    verdicts.set(entry.sha1, { known: false, at: now() });
    result.unknown.push(entry.key);
  }
  for (const hash of known) verdicts.set(hash, { known: true, at: now() });

  return result;
}
