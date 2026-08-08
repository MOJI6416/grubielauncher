import { execFile } from "child_process";
import netstat from "node-netstat";

export interface TcpConnection {
  state: string;
  localPort: number;
  remotePort: number;
  pid: number | null;
}

function parsePort(raw: string): number {
  const port = Number(raw.slice(raw.lastIndexOf(":") + 1));
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

function listViaSs(): Promise<TcpConnection[]> {
  return new Promise((resolve, reject) => {
    execFile(
      "ss",
      ["-tnap"],
      { maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const connections: TcpConnection[] = [];

        for (const line of stdout.split("\n")) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 5) continue;

          const state = parts[0].toUpperCase();
          if (state === "STATE") continue;

          const localPort = parsePort(parts[3]);
          if (!localPort) continue;

          const pidMatch = line.match(/pid=(\d+)/);

          connections.push({
            state: state === "ESTAB" ? "ESTABLISHED" : state,
            localPort,
            remotePort: parsePort(parts[4]),
            pid: pidMatch ? Number(pidMatch[1]) : null,
          });
        }

        resolve(connections);
      },
    );
  });
}

function listViaNetstat(): Promise<TcpConnection[]> {
  return new Promise((resolve, reject) => {
    const connections: TcpConnection[] = [];

    netstat(
      {
        done: (error) => {
          if (error) reject(new Error(error));
          else resolve(connections);
        },
      },
      (item: any) => {
        if (!String(item?.protocol || "").startsWith("tcp")) return;

        connections.push({
          state: String(item?.state || "").toUpperCase(),
          localPort: Number(item?.local?.port) || 0,
          remotePort: Number(item?.remote?.port) || 0,
          pid: typeof item?.pid === "number" && item.pid > 0 ? item.pid : null,
        });
      },
    );
  });
}

export function listTcpConnections(): Promise<TcpConnection[]> {
  return process.platform === "linux" ? listViaSs() : listViaNetstat();
}
