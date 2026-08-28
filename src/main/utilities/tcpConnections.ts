import { execFile } from "child_process";
import fs from "fs-extra";
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

const PROC_NET_TCP_STATES: Record<string, string> = {
  "01": "ESTABLISHED",
  "02": "SYN_SENT",
  "03": "SYN_RECV",
  "04": "FIN_WAIT1",
  "05": "FIN_WAIT2",
  "06": "TIME_WAIT",
  "07": "CLOSE",
  "08": "CLOSE_WAIT",
  "09": "LAST_ACK",
  "0A": "LISTEN",
  "0B": "CLOSING",
};

function parseHexPort(raw: string): number {
  const port = Number.parseInt(raw.slice(raw.lastIndexOf(":") + 1), 16);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

export function parseProcNetTcp(content: string): TcpConnection[] {
  const connections: TcpConnection[] = [];

  for (const line of content.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    const localPort = parseHexPort(parts[1]);
    if (!localPort) continue;

    const stateCode = parts[3].toUpperCase();

    connections.push({
      state: PROC_NET_TCP_STATES[stateCode] || stateCode,
      localPort,
      remotePort: parseHexPort(parts[2]),
      pid: null,
    });
  }

  return connections;
}

async function listViaProcNet(): Promise<TcpConnection[]> {
  const connections: TcpConnection[] = [];
  let readAny = false;

  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    const content = await fs.readFile(file, "utf-8").catch(() => null);
    if (content === null) continue;

    readAny = true;
    connections.push(...parseProcNetTcp(content));
  }

  if (!readAny) throw new Error("No way to list TCP connections on this system");

  return connections;
}

export async function listTcpConnections(): Promise<TcpConnection[]> {
  if (process.platform !== "linux") return await listViaNetstat();

  try {
    return await listViaSs();
  } catch {
    return await listViaProcNet();
  }
}
