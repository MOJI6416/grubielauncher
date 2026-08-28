import fs from "fs-extra";
import path from "path";

const pendingWrites = new Map<string, Promise<void>>();
const sweptDirs = new Set<string>();

const TMP_SUFFIX_PATTERN = /\.tmp-\d+-\d+$/;
const STALE_TMP_AGE_MS = 5 * 60 * 1000;
const RENAME_RETRY_DELAYS_MS = [10, 25, 50, 100];
const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function isRetryableRenameError(error: unknown, attempt: number): boolean {
  if (attempt >= RENAME_RETRY_DELAYS_MS.length) return false;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && RENAME_RETRY_CODES.has(code);
}

async function replaceByRename(source: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(source, target);
      return;
    } catch (error) {
      if (!isRetryableRenameError(error, attempt)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    milliseconds,
  );
}

function replaceByRenameSync(source: string, target: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(source, target);
      return;
    } catch (error) {
      if (!isRetryableRenameError(error, attempt)) throw error;
      sleepSync(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

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
    await replaceByRename(tmpFile, filePath);
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
    replaceByRenameSync(tmpFile, filePath);
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

export function mutateJsonAtomic<T>(
  filePath: string,
  mutate: (current: T | null) => T | Promise<T>,
  options?: { mode?: number; spaces?: number },
): Promise<void> {
  void sweepStaleTmpFiles(filePath);

  const key = path.resolve(filePath);
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      let current: T | null = null;

      try {
        current = (await fs.readJSON(filePath, "utf-8")) as T;
      } catch {
        current = null;
      }

      await writeJsonOnce(filePath, await mutate(current), options);
    });

  pendingWrites.set(key, next);
  void next.catch(() => {}).then(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  });

  return next;
}
