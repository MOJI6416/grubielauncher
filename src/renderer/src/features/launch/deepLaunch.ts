export interface PendingDeepLaunch {
  versionName: string;
  instance: number;
}

export type DeepLaunchDecision<T> =
  | { kind: "wait" }
  | { kind: "launch"; version: T; instance: number }
  | { kind: "notFound" };

export function resolveDeepLaunch<T extends { version: { name: string } }>(
  pending: PendingDeepLaunch | null,
  versions: T[],
  versionsLoaded: boolean,
): DeepLaunchDecision<T> {
  if (!pending) return { kind: "wait" };

  const version = versions.find((item) => item.version.name === pending.versionName);
  if (version) return { kind: "launch", version, instance: pending.instance };

  return versionsLoaded ? { kind: "notFound" } : { kind: "wait" };
}
