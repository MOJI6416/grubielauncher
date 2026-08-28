import { afterEach, describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());

const readFile = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({ execFile }));
vi.mock("node-netstat", () => ({ default: vi.fn() }));
vi.mock("fs-extra", () => ({ default: { readFile } }));

import { listTcpConnections } from "./tcpConnections";

const PROC_NET_TCP = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:D383 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41234 1 0000000000000000 100 0 0 10 0
   1: 0A00020F:D368 07015333:63DD 01 00000000:00000000 00:00000000 00000000  1000        0 41240 1 0000000000000000 20 4 30 10 -1
`;

const SS_OUTPUT = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
LISTEN 0      4096   0.0.0.0:25565       0.0.0.0:*    users:(("java",pid=4242,fd=7))
ESTAB  0      0      192.168.0.10:54120  51.83.1.7:25565 users:(("java",pid=4242,fd=90))
ESTAB  0      0      [::1]:38044         [::1]:7070
TIME-WAIT 0   0      192.168.0.10:54118  51.83.1.7:25565
`;

function respondWith(stdout: string, error: Error | null = null) {
  execFile.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => callback(error, stdout),
  );
}

afterEach(() => {
  vi.clearAllMocks();
  readFile.mockReset();
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

const originalPlatform = process.platform;

describe("listTcpConnections on linux", () => {
  it("parses ss output into ports, states and pids", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    respondWith(SS_OUTPUT);

    const connections = await listTcpConnections();

    expect(execFile).toHaveBeenCalledWith(
      "ss",
      ["-tnap"],
      expect.anything(),
      expect.any(Function),
    );
    expect(connections).toEqual([
      { state: "LISTEN", localPort: 25565, remotePort: 0, pid: 4242 },
      {
        state: "ESTABLISHED",
        localPort: 54120,
        remotePort: 25565,
        pid: 4242,
      },
      { state: "ESTABLISHED", localPort: 38044, remotePort: 7070, pid: null },
      {
        state: "TIME-WAIT",
        localPort: 54118,
        remotePort: 25565,
        pid: null,
      },
    ]);
  });

  it("falls back to /proc/net/tcp when ss is not installed", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    respondWith("", new Error("spawn ss ENOENT"));
    readFile.mockImplementation(async (file: string) =>
      file === "/proc/net/tcp" ? PROC_NET_TCP : Promise.reject(new Error("ENOENT")),
    );

    await expect(listTcpConnections()).resolves.toEqual([
      { state: "LISTEN", localPort: 54147, remotePort: 0, pid: null },
      { state: "ESTABLISHED", localPort: 54120, remotePort: 25565, pid: null },
    ]);
  });

  it("rejects when neither ss nor /proc/net is readable", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    respondWith("", new Error("spawn ss ENOENT"));
    readFile.mockRejectedValue(new Error("ENOENT"));

    await expect(listTcpConnections()).rejects.toThrow();
  });
});
