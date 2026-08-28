const api = window.api;

export async function clearLauncherTemp(launcherPath?: string) {
  if (!launcherPath) return;

  try {
    await api.fs.rimraf(await api.path.join(launcherPath, "temp"));
  } catch {}
}
