export interface LauncherWhatsNewState {
  whatsNew?: {
    lastSeenVersion?: string;
    updatedAt?: string;
  };
  onboardingDone?: boolean;
  instanceConfCleanup?: boolean;
}

export type WhatsNewDecision =
  | { type: "firstLaunch"; shouldShow: false }
  | { type: "sameVersion"; shouldShow: false }
  | { type: "updated"; shouldShow: true };

interface ParsedVersion {
  release: number[];
  prerelease: string[];
}

function parseVersion(version: string): ParsedVersion {
  const value = String(version || "").trim();
  const core = value.split("+")[0];
  const separator = core.indexOf("-");
  const releasePart = separator >= 0 ? core.slice(0, separator) : core;
  const prereleasePart = separator >= 0 ? core.slice(separator + 1) : "";

  return {
    release: releasePart
      .split(".")
      .map((part) => Number(part))
      .map((part) => (Number.isFinite(part) ? part : 0)),
    prerelease: prereleasePart ? prereleasePart.split(".") : [],
  };
}

function comparePrereleaseIdentifier(current: string, previous: string) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  const currentIsNumber = current !== "" && Number.isFinite(currentNumber);
  const previousIsNumber = previous !== "" && Number.isFinite(previousNumber);

  if (currentIsNumber && previousIsNumber) {
    if (currentNumber > previousNumber) return 1;
    if (currentNumber < previousNumber) return -1;
    return 0;
  }

  if (currentIsNumber) return -1;
  if (previousIsNumber) return 1;

  if (current > previous) return 1;
  if (current < previous) return -1;
  return 0;
}

function comparePrerelease(current: string[], previous: string[]) {
  if (current.length === 0 && previous.length === 0) return 0;
  if (current.length === 0) return 1;
  if (previous.length === 0) return -1;

  const length = Math.max(current.length, previous.length);
  for (let i = 0; i < length; i++) {
    const currentPart = current[i];
    const previousPart = previous[i];
    if (currentPart === undefined) return -1;
    if (previousPart === undefined) return 1;

    const result = comparePrereleaseIdentifier(currentPart, previousPart);
    if (result !== 0) return result;
  }

  return 0;
}

export function compareLauncherVersions(current: string, previous: string) {
  const currentVersion = parseVersion(current);
  const previousVersion = parseVersion(previous);
  const length = Math.max(
    currentVersion.release.length,
    previousVersion.release.length,
    3,
  );

  for (let i = 0; i < length; i++) {
    const currentPart = currentVersion.release[i] ?? 0;
    const previousPart = previousVersion.release[i] ?? 0;
    if (currentPart > previousPart) return 1;
    if (currentPart < previousPart) return -1;
  }

  return comparePrerelease(currentVersion.prerelease, previousVersion.prerelease);
}

export function getWhatsNewDecision(
  currentVersion: string,
  state: LauncherWhatsNewState | null | undefined,
): WhatsNewDecision {
  const lastSeenVersion = state?.whatsNew?.lastSeenVersion?.trim();
  if (!lastSeenVersion) {
    return { type: "firstLaunch", shouldShow: false };
  }

  if (compareLauncherVersions(currentVersion, lastSeenVersion) > 0) {
    return { type: "updated", shouldShow: true };
  }

  return { type: "sameVersion", shouldShow: false };
}

export function markWhatsNewSeen(
  currentVersion: string,
  state: LauncherWhatsNewState | null | undefined,
): LauncherWhatsNewState {
  return {
    ...(state || {}),
    whatsNew: {
      ...(state?.whatsNew || {}),
      lastSeenVersion: currentVersion,
      updatedAt: new Date().toISOString(),
    },
  };
}
