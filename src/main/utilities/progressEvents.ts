import type { WebContents } from "electron";

export interface ProgressUpdate {
  phase?: string;
  processedBytes: number;
  totalBytes: number;
}

export const PROGRESS_INTERVAL_MS = 150;

export function throttleProgress<T extends ProgressUpdate>(
  send: (progress: T) => void,
  intervalMs = PROGRESS_INTERVAL_MS,
  now: () => number = Date.now,
): (progress: T) => void {
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let lastPhase: string | undefined;

  return (progress) => {
    const time = now();
    const isNewPhase = progress.phase !== lastPhase;
    const isFinished =
      progress.totalBytes > 0 && progress.processedBytes >= progress.totalBytes;

    if (!isNewPhase && !isFinished && time - lastSentAt < intervalMs) return;

    lastPhase = progress.phase;
    lastSentAt = time;
    send(progress);
  };
}

export function sendProgress(
  sender: WebContents,
  channel: string,
  payload: unknown,
): void {
  if (sender.isDestroyed()) return;

  try {
    sender.send(channel, payload);
  } catch {}
}
