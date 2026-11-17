export interface PendingDeepLaunch {
  versionName: string;
  instance: number;
  world?: string;
  server?: string;
}

export interface DeepLaunchQuick {
  single?: string;
  multiplayer?: string;
}

export type DeepLaunchDecision<T> =
  | { kind: "wait" }
  | { kind: "launch"; version: T; instance: number; quick?: DeepLaunchQuick }
  | { kind: "notFound" };

export function deepLaunchQuick(
  pending: Pick<PendingDeepLaunch, "world" | "server">,
): DeepLaunchQuick | undefined {
  if (pending.world) return { single: pending.world };
  if (pending.server) return { multiplayer: pending.server };
  return undefined;
}

export function resolveDeepLaunch<T extends { version: { name: string } }>(
  pending: PendingDeepLaunch | null,
  versions: T[],
  versionsLoaded: boolean,
): DeepLaunchDecision<T> {
  if (!pending) return { kind: "wait" };

  const version = versions.find((item) => item.version.name === pending.versionName);
  if (version) {
    const quick = deepLaunchQuick(pending);
    return {
      kind: "launch",
      version,
      instance: pending.instance,
      ...(quick ? { quick } : {}),
    };
  }

  return versionsLoaded ? { kind: "notFound" } : { kind: "wait" };
}
