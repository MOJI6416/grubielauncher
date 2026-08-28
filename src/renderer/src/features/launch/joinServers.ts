import { IServer } from "@/types/ServersList";

function serverKey(server: IServer): string {
  return (server.ip || "").trim().toLowerCase();
}

export function keepOwnServers(
  before: IServer[],
  after: IServer[],
): IServer[] {
  const known = new Set(after.map(serverKey).filter(Boolean));

  return before.filter((server) => {
    const key = serverKey(server);
    if (!key || known.has(key)) return false;
    known.add(key);
    return true;
  });
}
