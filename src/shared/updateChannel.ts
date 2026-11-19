export type UpdateChannel = "release" | "beta" | "alpha";

export const UPDATE_CHANNELS: UpdateChannel[] = ["release", "beta", "alpha"];

export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = "release";

const RANK: Record<UpdateChannel, number> = { release: 0, beta: 1, alpha: 2 };

export function isUpdateChannel(value: unknown): value is UpdateChannel {
  return (UPDATE_CHANNELS as unknown[]).includes(value);
}

export function channelRank(value: string | undefined | null): number {
  return isUpdateChannel(value) ? RANK[value] : RANK.release;
}

export function isStableGameVersion(type: string | undefined | null): boolean {
  return type !== "snapshot";
}

export function resolveUpdateChannel(input: {
  instance?: UpdateChannel | null;
  global: UpdateChannel;
  gameVersionType?: string | null;
}): UpdateChannel {
  if (isUpdateChannel(input.instance)) return input.instance;
  return isStableGameVersion(input.gameVersionType) ? input.global : "alpha";
}

export function allowsReleaseType(
  channel: UpdateChannel,
  releaseType: string | undefined | null,
): boolean {
  return channelRank(releaseType) <= RANK[channel];
}
