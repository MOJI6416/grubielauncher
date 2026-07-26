import fs from "fs-extra";
import path from "path";

const pendingWrites = new Map<string, Promise<void>>();

async function writeJsonOnce(
  filePath: string,
  data: unknown,
  options?: { mode?: number; spaces?: number },
): Promise<void> {
  const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const payload = Buffer.from(
    JSON.stringify(data, null, options?.spaces ?? 2),
    "utf-8",
  );

  try {
    const fd = await fs.open(tmpFile, "w", options?.mode);
    try {
      await fs.write(fd, payload, 0, payload.length, 0);
      await fs.fsync(fd);
    } finally {
      await fs.close(fd);
    }
    await fs.move(tmpFile, filePath, { overwrite: true });
  } catch (error) {
    await fs.remove(tmpFile).catch(() => {});
    throw error;
  }
}

export function writeJsonAtomic(
  filePath: string,
  data: unknown,
  options?: { mode?: number; spaces?: number },
): Promise<void> {
  const key = path.resolve(filePath);
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => writeJsonOnce(filePath, data, options));

  pendingWrites.set(key, next);
  void next.catch(() => {}).then(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  });

  return next;
}
