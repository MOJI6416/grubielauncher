import path from "path";
import fs from "fs-extra";
import {
  LINUX_LAUNCH_TOOL_COMMANDS,
  type LinuxLaunchTools,
} from "@/shared/launchCommand";
import { childProcessEnv } from "./childEnv";

export type { LinuxLaunchTools };

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fs.access(file, fs.constants.X_OK);
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function findInPath(
  command: string,
  pathValue: string | undefined = childProcessEnv().PATH,
): Promise<string | null> {
  for (const dir of (pathValue ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

export async function detectLinuxLaunchTools(): Promise<LinuxLaunchTools> {
  if (process.platform !== "linux") {
    return { installed: { gamemode: false, mangohud: false }, nvidia: false };
  }

  const [gamemode, mangohud, nvidia] = await Promise.all([
    findInPath(LINUX_LAUNCH_TOOL_COMMANDS.gamemode),
    findInPath(LINUX_LAUNCH_TOOL_COMMANDS.mangohud),
    fs.pathExists("/proc/driver/nvidia/version").catch(() => false),
  ]);

  return {
    installed: { gamemode: gamemode !== null, mangohud: mangohud !== null },
    nvidia,
  };
}
