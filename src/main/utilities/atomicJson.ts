import fs from "fs-extra";
import path from "path";

const pendingWrites = new Map<string, Promise<void>>();
const sweptDirs = new Set<string>();

const TMP_SUFFIX_PATTERN = /\.tmp-\d+-\d+$/;
const STALE_TMP_AGE_MS = 5 * 60 * 1000;

function buildTmpPath(filePath: string): string {
  return `${filePath}.tmp-${process.pid}-${Date.now()}`;
}

async function sweepStaleTmpFiles(filePath: string): Promise<void> {
  const dir = path.dirname(path.resolve(filePath));
  if (sweptDirs.has(dir)) return;
  sweptDirs.add(dir);

  try {
    const entries = await fs.readdir(dir);
    const now = Date.now();

    await Promise.all(
      entries
        .filter((entry) => TMP_SUFFIX_PATTERN.test(entry))
        .map(async (entry) => {
          const target = path.join(dir, entry);
          const stats = await fs.stat(target).catch(() => null);
          if (!stats?.isFile() || now - stats.mtimeMs < STALE_TMP_AGE_MS) return;
          await fs.remove(target).catch(() => {});
        }),
    );
  } catch {}
}

async function writeJsonOnce(
  filePath: string,
  data: unknown,
  options?: { mode?: number; spaces?: number },
): Promise<void> {
  const tmpFile = buildTmpPath(filePath);
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

export function writeJsonAtomicSync(
  filePath: string,
  data: unknown,
  options?: { mode?: number; spaces?: number },
): void {
  const tmpFile = buildTmpPath(filePath);
  const payload = Buffer.from(
    JSON.stringify(data, null, options?.spaces ?? 2),
    "utf-8",
  );

  try {
    const fd = fs.openSync(tmpFile, "w", options?.mode);
    try {
      fs.writeSync(fd, payload, 0, payload.length, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.moveSync(tmpFile, filePath, { overwrite: true });
  } catch (error) {
    try {
      fs.removeSync(tmpFile);
    } catch {}
    throw error;
  }
}

export function writeJsonAtomic(
  filePath: string,
  data: unknown,
  options?: { mode?: number; spaces?: number },
): Promise<void> {
  void sweepStaleTmpFiles(filePath);

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
