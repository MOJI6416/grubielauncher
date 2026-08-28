export type ProfileSection =
  | "achievements"
  | "leaderboard"
  | "modpacks"
  | "skins"
  | null;

const SECTIONS: Exclude<ProfileSection, null>[] = [
  "achievements",
  "leaderboard",
  "modpacks",
  "skins",
];

const OWNER_ONLY: Exclude<ProfileSection, null>[] = [
  "achievements",
  "leaderboard",
  "skins",
];

export function parseProfileSection(value: string | undefined): ProfileSection {
  if (!value) return null;
  return SECTIONS.includes(value as Exclude<ProfileSection, null>)
    ? (value as ProfileSection)
    : null;
}

export function resolveProfileSection(
  value: ProfileSection,
  isOwner: boolean,
): ProfileSection {
  if (!value) return null;
  if (!isOwner && OWNER_ONLY.includes(value)) return null;
  return value;
}
