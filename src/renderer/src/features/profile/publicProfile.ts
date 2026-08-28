import type { IModpackCard } from "@/types/Backend";
import type { IPublicProfile } from "@/types/Profile";

export function isSameProfile(
  profile: IPublicProfile | null | undefined,
  userId: string | undefined,
): boolean {
  return Boolean(profile?.id) && Boolean(userId) && profile?.id === userId;
}

export function profileModpacks(
  profile: IPublicProfile | null | undefined,
  userId: string | undefined,
): IModpackCard[] {
  if (!isSameProfile(profile, userId)) return [];

  const items = profile?.modpacks;
  return Array.isArray(items) ? items.filter((item) => Boolean(item?.id)) : [];
}

export function profileRank(
  profile: IPublicProfile | null | undefined,
  userId: string | undefined,
): number | null {
  if (!isSameProfile(profile, userId)) return null;

  const rank = profile?.rank;
  return typeof rank === "number" && rank > 0 ? rank : null;
}
