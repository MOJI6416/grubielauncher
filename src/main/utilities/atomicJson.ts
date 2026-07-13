import fs from "fs-extra";

export async function writeJsonAtomic(
  filePath: string,
  data: unknown,
  options?: { mode?: number; spaces?: number },
): Promise<void> {
  const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(data, null, options?.spaces ?? 2), {
      encoding: "utf-8",
      mode: options?.mode,
    });
    await fs.move(tmpFile, filePath, { overwrite: true });
  } catch (error) {
    await fs.remove(tmpFile).catch(() => {});
    throw error;
  }
}
