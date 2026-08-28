import type { IServer } from "@/types/ServersList";

const api = window.api;

export async function readInstanceServers(
  versionPath: string,
): Promise<IServer[] | null> {
  if (!versionPath) return null;

  let failed = false;
  const stopWatching = api.events.onIpcError((payload) => {
    if (payload?.channel === "servers:read") failed = true;
  });

  try {
    const serversPath = await api.path.join(versionPath, "servers.dat");
    const servers = await api.servers.read(serversPath);

    return failed || !Array.isArray(servers) ? null : servers;
  } catch {
    return null;
  } finally {
    stopWatching();
  }
}
