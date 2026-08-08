import path from "path";
import fs from "fs-extra";

const SANDBOX_DIRS = [
  "app/com.discordapp.Discord",
  "app/com.discordapp.DiscordCanary",
  "snap.discord",
  "snap.discord-canary",
];

const MAX_SOCKET_ID = 10;

async function exists(socketPath: string): Promise<boolean> {
  try {
    await fs.stat(socketPath);
    return true;
  } catch {
    return false;
  }
}

export async function linkDiscordIpcSocket(): Promise<void> {
  if (process.platform !== "linux") return;

  const runtimeDir = process.env["XDG_RUNTIME_DIR"];
  if (!runtimeDir) return;

  try {
    for (let id = 0; id < MAX_SOCKET_ID; id++) {
      if (await exists(path.join(runtimeDir, `discord-ipc-${id}`))) return;
    }

    for (const dir of SANDBOX_DIRS) {
      for (let id = 0; id < MAX_SOCKET_ID; id++) {
        const source = path.join(runtimeDir, dir, `discord-ipc-${id}`);
        if (!(await exists(source))) continue;

        const target = path.join(runtimeDir, `discord-ipc-${id}`);
        await fs.remove(target);
        await fs.symlink(source, target);
        return;
      }
    }
  } catch (error) {
    console.warn("Failed to link Discord IPC socket:", error);
  }
}
