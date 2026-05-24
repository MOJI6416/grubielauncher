export interface LauncherWhatsNewState {
  whatsNew?: {
    lastSeenVersion?: string;
    updatedAt?: string;
  };
}

export type WhatsNewDecision =
  | { type: "firstLaunch"; shouldShow: false }
  | { type: "sameVersion"; shouldShow: false }
  | { type: "updated"; shouldShow: true };

function parseVersion(version: string): number[] {
  return String(version || "")
    .split(/[.+-]/)
    .map((part) => Number(part))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareLauncherVersions(current: string, previous: string) {
  const currentParts = parseVersion(current);
  const previousParts = parseVersion(previous);
  const length = Math.max(currentParts.length, previousParts.length, 3);

  for (let i = 0; i < length; i++) {
    const currentPart = currentParts[i] ?? 0;
    const previousPart = previousParts[i] ?? 0;
    if (currentPart > previousPart) return 1;
    if (currentPart < previousPart) return -1;
  }

  return 0;
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
