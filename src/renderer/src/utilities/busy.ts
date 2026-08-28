export const MIN_BUSY_MS = 600;

export function remainingBusyMs(
  startedAt: number,
  now: number,
  minMs: number = MIN_BUSY_MS,
): number {
  const left = minMs - (now - startedAt);
  return left > 0 ? left : 0;
}

export function holdBusy(
  startedAt: number,
  minMs: number = MIN_BUSY_MS,
): Promise<void> {
  const left = remainingBusyMs(startedAt, Date.now(), minMs);
  if (left === 0) return Promise.resolve();

  return new Promise((resolve) => setTimeout(resolve, left));
}
