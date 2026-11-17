import os from "os";
import fs from "fs-extra";
import { parseMemAvailable } from "@/shared/memoryCheck";

export async function availableMemoryBytes(
  platform: NodeJS.Platform = process.platform,
): Promise<number | null> {
  if (platform === "linux") {
    const meminfo = await fs
      .readFile("/proc/meminfo", "utf-8")
      .catch(() => null);
    return meminfo ? parseMemAvailable(meminfo) : null;
  }

  if (platform === "win32") return os.freemem();

  return null;
}
