import { afterEach, describe, expect, it, vi } from "vitest";

const execFile = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({ execFile }));
vi.mock("node-netstat", () => ({ default: vi.fn() }));

import { listTcpConnections } from "./tcpConnections";

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

  it("rejects when ss is not available", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    respondWith("", new Error("spawn ss ENOENT"));

    await expect(listTcpConnections()).rejects.toThrow("ENOENT");
  });
});
