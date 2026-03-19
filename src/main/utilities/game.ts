import {
  ChildProcessWithoutNullStreams,
  execFile,
  spawn,
} from "child_process";
import { gameProcesses, gameRuntime } from "./runtime";
import { mainWindow } from "../windows/mainWindow";
import { IConsoleMessage } from "@/types/Console";
import netstat from "node-netstat";
import { rpc } from "../rpc";

function safeSend(channel: string, ...args: any[]) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed()
  )
    return;
  try {
    mainWindow.webContents.send(channel, ...args);
  } catch {}
}

function safeMinimize() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.minimize();
  } catch {}
}

function safeRestoreIfMinimized() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
  } catch {}
}

function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      child.off("close", onClose);
      clearTimeout(timeoutId);
    };

    const onClose = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    }, timeoutMs);

    child.once("close", onClose);
  });
}

function execFileSafe(command: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile(command, args, () => resolve());
  });
}

async function getChildProcessIds(pid: number): Promise<number[]> {
  if (process.platform === "win32") return [];

  return await new Promise((resolve) => {
    execFile("ps", ["-o", "pid=", "--ppid", String(pid)], (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }

      const childIds = stdout
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((value) => Number.isInteger(value) && value > 0);

      resolve(childIds);
    });
  });
}

async function killUnixProcessTree(
  pid: number,
  signal: NodeJS.Signals,
  visited = new Set<number>(),
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0 || visited.has(pid)) return;
  visited.add(pid);

  const childIds = await getChildProcessIds(pid);
  await Promise.all(
    childIds.map((childPid) => killUnixProcessTree(childPid, signal, visited)),
  );

  try {
    process.kill(pid, signal);
  } catch {}
}

async function terminateProcessTree(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    await execFileSafe("taskkill", ["/PID", String(pid), "/T"]);
    if (!(await waitForExit(child, 2000))) {
      await execFileSafe("taskkill", ["/PID", String(pid), "/T", "/F"]);
      await waitForExit(child, 2000);
    }
    return;
  }

  await killUnixProcessTree(pid, "SIGTERM");
  if (await waitForExit(child, 2000)) return;

  await killUnixProcessTree(pid, "SIGKILL");
  await waitForExit(child, 2000);
}

export function runJar(command: string, args: string[], cwd: string) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settleResolve = (value: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
      try {
        jar.kill();
      } catch {}
    };

    const jar = spawn(command, args, { cwd });

    const onStdout = (data: any) => {
      const output = data.toString();
      if (output.includes("Successfully installed client into launcher.")) {
        settleResolve("done");
      }
    };

    const onStderr = (data: any) => {
      settleReject(data.toString());
    };

    const onClose = (code: any) => {
      settleResolve(code);
    };

    const onError = (err: any) => {
      settleReject(err);
    };

    function cleanup() {
      try {
        jar.stdout?.off("data", onStdout);
        jar.stderr?.off("data", onStderr);
        jar.off("close", onClose);
        jar.off("error", onError);
      } catch {}
    }

    jar.stdout?.on("data", onStdout);
    jar.stderr?.on("data", onStderr);
    jar.on("close", onClose);
    jar.on("error", onError);
  });
}

export function installServer(
  command: string,
  args: string[],
  serverPath: string,
) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settleResolve = (value: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
      try {
        server.kill();
      } catch {}
    };

    const server = spawn(command, args, { cwd: serverPath });

    const onStdout = (data: any) => {
      const output = data.toString();
      if (output.includes("EULA")) {
        settleResolve("done");
      }
    };

    const onClose = (code: any) => {
      settleResolve(code);
    };

    const onError = (err: any) => {
      settleReject(err);
    };

    function cleanup() {
      try {
        server.stdout?.off("data", onStdout);
        server.off("close", onClose);
        server.off("error", onError);
      } catch {}
    }

    server.stdout?.on("data", onStdout);
    server.on("close", onClose);
    server.on("error", onError);
  });
}

export async function closeGame(versionName: string, instance: number) {
  const instanceKey = `${versionName}-${instance}`;
  const javaProcess = gameProcesses.get(instanceKey);
  if (!javaProcess) return;

  await terminateProcessTree(javaProcess.process);
}

export function runGame(
  command: string,
  args: string[],
  versionPath: string,
  versionName: string,
  instance: number,
  accessToken: string,
  serverAddress?: string,
) {
  const instanceKey = `${versionName}-${instance}`;

  safeSend("consoleClear", versionName, instance);
  rpc.setGameLaunching({ versionName, instance, serverAddress });

  const javaProcess = spawn(command, args, {
    cwd: versionPath,
  });

  javaProcess.once("spawn", () => {
    rpc.setGamePlaying({ versionName, instance, serverAddress });
  });

  gameRuntime.register({
    process: javaProcess,
    versionName,
    instance,
    versionPath,
    serverPort: null,
    accessToken,
  });
  gameRuntime.emitStarted({
    key: instanceKey,
    versionName,
    instance,
  });

  let netstatInFlight = false;
  let intervalId: NodeJS.Timeout | null = null;

  const checkConnection = (): void => {
    const processData = gameProcesses.get(instanceKey);
    if (!processData || !processData.serverPort) return;

    if (netstatInFlight) return;
    netstatInFlight = true;

    try {
      const connections: any[] = [];

      netstat(
        {
          filter: {
            remote: { port: processData.serverPort },
            protocol: "tcp",
          },
        },
        (item: any) => {
          if (item.state == "ESTABLISHED") connections.push(item);
        },
      );

      setTimeout(() => {
        try {
          const stillData = gameProcesses.get(instanceKey);
          if (!stillData || stillData.serverPort !== processData.serverPort)
            return;

          if (connections.length === 0) {
            safeSend("friendUpdate", { serverAddress: "" });
            stillData.serverPort = null;
            rpc.updateGameServer(versionName, instance);
          }
        } finally {
          netstatInFlight = false;
        }
      }, 1000);
    } catch {
      netstatInFlight = false;
    }
  };

  intervalId = setInterval(checkConnection, 5000);

  javaProcess.stdout?.on("data", async (data) => {
    const message = data.toString();
    gameRuntime.emitStdout({
      key: instanceKey,
      versionName,
      instance,
      message,
    });

    if (
      message.includes("Setting gameDir") ||
      message.includes("Setting user")
    ) {
      safeMinimize();
      safeSend("launch");
    }

    const connectMatch = message.match(/Connecting to ([\w.-]+), (\d+)/);
    if (connectMatch) {
      const processData = gameProcesses.get(instanceKey);
      if (processData) {
        const serverAddress = connectMatch[1];
        processData.serverPort = parseInt(connectMatch[2], 10);
        gameRuntime.emitServerConnection({
          key: instanceKey,
          versionName,
          instance,
          serverAddress,
          serverPort: processData.serverPort,
        });
        safeSend("friendUpdate", {
          serverAddress: `${serverAddress}:${processData.serverPort}`,
        });
        rpc.updateGameServer(
          versionName,
          instance,
          `${serverAddress}:${processData.serverPort}`,
        );
      }
    }

    const msg: IConsoleMessage = {
      type: "info",
      message,
      tips: [],
    };
    safeSend("consoleMessage", versionName, instance, msg);
  });

  javaProcess.stderr?.on("data", (data) => {
    gameRuntime.emitStderr({
      key: instanceKey,
      versionName,
      instance,
      message: data.toString(),
    });

    const msg: IConsoleMessage = {
      type: "error",
      message: data.toString(),
      tips: [],
    };
    safeSend("consoleMessage", versionName, instance, msg);
  });

  javaProcess.on("error", (err) => {
    if (intervalId) clearInterval(intervalId);

    gameRuntime.unregister(versionName, instance);
    gameRuntime.emitClose({
      key: instanceKey,
      versionName,
      instance,
      code: 1,
    });

    const msg: IConsoleMessage = {
      type: "error",
      message: `Game process failed to start: ${(err as Error)?.message || String(err)}`,
      tips: ["checkIntegrity"],
    };

    safeSend("consoleChangeStatus", versionName, instance, "error");
    safeSend("consoleMessage", versionName, instance, msg);

    safeRestoreIfMinimized();

    safeSend("launch");
    rpc.clearGameContext(versionName, instance);

    safeSend("friendUpdate", {
      versionName: "",
      versionCode: "",
      serverAddress: "",
    });
  });

  javaProcess.on("close", (c, signal) => {
    let code = typeof c === "number" ? c : 0;
    if (signal == "SIGTERM") code = 0;

    const msg: IConsoleMessage = {
      type: "info",
      message: `Game closed with code ${code}`,
      tips: [],
    };

    if (code === 0) {
      safeSend("consoleChangeStatus", versionName, instance, "stopped");
      msg.type = "success";
    } else {
      safeSend("consoleChangeStatus", versionName, instance, "error");
      msg.type = "error";
      msg.tips.push("checkIntegrity");
    }

    safeSend("consoleMessage", versionName, instance, msg);

    if (intervalId) clearInterval(intervalId);

    gameRuntime.unregister(versionName, instance);
    gameRuntime.emitClose({
      key: instanceKey,
      versionName,
      instance,
      code,
    });

    safeRestoreIfMinimized();

    safeSend("launch");
    rpc.clearGameContext(versionName, instance);

    safeSend("friendUpdate", {
      versionName: "",
      versionCode: "",
      serverAddress: "",
    });
  });
}
