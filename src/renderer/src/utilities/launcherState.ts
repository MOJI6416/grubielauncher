import { LauncherWhatsNewState } from "./whatsNew";

const api = window.api;

async function getLauncherStatePath(launcherPath: string) {
  return await api.path.join(launcherPath, "launcher-state.json");
}

export async function readLauncherState(
  launcherPath: string,
): Promise<LauncherWhatsNewState | null> {
  const statePath = await getLauncherStatePath(launcherPath);
  if (!(await api.fs.pathExists(statePath))) return null;

  try {
    return await api.fs.readJSON<LauncherWhatsNewState>(statePath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeLauncherState(
  launcherPath: string,
  state: LauncherWhatsNewState,
) {
  const statePath = await getLauncherStatePath(launcherPath);
  await api.fs.writeJSON(statePath, state);
}
