import type { IModpack } from "@/types/Backend";

type PackIdentity = Pick<IModpack, "_id" | "shareCode">;

// The code a published build is known by everywhere outside the database: it
// names the build's storage folder, it is what `grubielauncher://pack/<code>`
// and `grubielauncher.com/pack/<code>` carry, and it is what an instance keeps
// locally after it was published.
//
// The row id is NOT interchangeable with it. The backend serves a build by id
// only while it is listed publicly, so a link built from the id dead-ends for
// everyone but the owner as soon as the build is unlisted — which is exactly
// the build people hand out by link. Builds published before share codes
// existed carry none and keep answering to their id.
export function packShareCode(modpack: PackIdentity): string {
  return modpack.shareCode || modpack._id;
}

export function publishedShareCodes(published: PackIdentity[]): Set<string> {
  return new Set(published.map(packShareCode));
}
