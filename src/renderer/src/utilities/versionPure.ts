import { ILocalAccount } from "@/types/Account";

export function isOwner(owner?: string, account?: ILocalAccount) {
  if (!owner || !account) return false;

  return `${account.type}_${account.nickname}` === owner;
}

export function parseVersionOwner(owner?: string) {
  if (!owner) return null;

  const separatorIndex = owner.indexOf("_");
  if (separatorIndex <= 0 || separatorIndex === owner.length - 1) {
    return {
      type: undefined,
      nickname: owner,
    };
  }

  return {
    type: owner.slice(0, separatorIndex),
    nickname: owner.slice(separatorIndex + 1),
  };
}

export function sanitizeExtraFileSegments(extraPath: string): string[] | null {
  const segments = extraPath
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== ".");

  if (
    segments.length === 0 ||
    segments.some((segment) => segment === ".." || segment.includes(":"))
  )
    return null;

  return segments;
}

export function supportsQuickPlayMultiplayer(versionId: string): boolean {
  const match = versionId.trim().match(/^(\d+)\.(\d+)/);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 20);
}
