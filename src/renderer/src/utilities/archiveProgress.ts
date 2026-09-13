import type { ArchiveExtractProgress } from "@/types/Archive";

export function progressPercent(
  processedBytes: number,
  totalBytes: number,
): number {
  if (!(totalBytes > 0)) return 0;

  return Math.max(
    0,
    Math.min(100, Math.round((processedBytes / totalBytes) * 100)),
  );
}

export async function withExtractProgress<T>(
  archivePath: string,
  onPercent: ((percent: number) => void) | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!onPercent) return await run();

  const unsubscribe = window.api.events.onArchiveExtractProgress(
    (progress: ArchiveExtractProgress) => {
      if (progress.archivePath !== archivePath) return;
      onPercent(progressPercent(progress.processedBytes, progress.totalBytes));
    },
  );

  try {
    return await run();
  } finally {
    unsubscribe();
  }
}
