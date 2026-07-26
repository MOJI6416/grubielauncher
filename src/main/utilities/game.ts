import { ChildProcessWithoutNullStreams, execFile, spawn } from "child_process";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { analyzeGameCrash } from "./crashAnalyzer";
import { gameProcesses, gameRuntime } from "./runtime";
import { mainWindow } from "../windows/mainWindow";
import { IConsoleMessage } from "@/types/Console";
import netstat from "node-netstat";
import { rpc } from "../rpc";
import { parseMinecraftServerConnectionLine } from "./gameConnection";
import { classifyConsoleStream, createLineReader } from "./consoleLog";
import {
  beginSession,
  endSession,
  markSessionReady,
  setSessionServer,
  type SessionContext,
} from "./statistics";

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

const SIGNAL_EXIT_BASE = 128;

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
    execFile(command, args, { windowsHide: true }, () => resolve());
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

export interface RunJarOptions {
  signal?: AbortSignal;
  onOutput?: (event: { stream: "stdout" | "stderr"; message: string }) => void;
}

function normalizeRunJarOptions(
  optionsOrSignal?: AbortSignal | RunJarOptions,
): RunJarOptions {
  if (!optionsOrSignal) return {};
  if ("aborted" in optionsOrSignal && "addEventListener" in optionsOrSignal) {
    return { signal: optionsOrSignal };
  }

  return optionsOrSignal;
}

export function runJar(
  command: string,
  args: string[],
  cwd: string,
  optionsOrSignal?: AbortSignal | RunJarOptions,
) {
  return new Promise((resolve, reject) => {
    const options = normalizeRunJarOptions(optionsOrSignal);
    const signal = options.signal;
    let settled = false;
    let successSeen = false;

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

    const onAbort = () => {
      void terminateProcessTree(jar).finally(() => {
        settleReject(new Error("AbortError"));
      });
    };

    const onStdout = (data: any) => {
      const output = data.toString();
      options.onOutput?.({ stream: "stdout", message: output });
      if (output.includes("Successfully installed client into launcher.")) {
        successSeen = true;
      }
    };

    const onStderr = (data: any) => {
      const output = data.toString();
      options.onOutput?.({ stream: "stderr", message: output });
    };

    const onClose = (code: any) => {
      settleResolve(successSeen ? "done" : code);
    };

    const onError = (err: any) => {
      settleReject(err);
    };

    function cleanup() {
      try {
        signal?.removeEventListener("abort", onAbort);
        jar.stdout?.off("data", onStdout);
        jar.stderr?.off("data", onStderr);
        jar.off("close", onClose);
        jar.off("error", onError);
      } catch {}
    }

    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort);
    }

    jar.stdout?.on("data", onStdout);
    jar.stderr?.on("data", onStderr);
    jar.on("close", onClose);
    jar.on("error", onError);
  });
}

const SERVER_INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
const SERVER_READY_MARKERS = [
  "EULA",
  'For help, type "help"',
  "For help, type 'help'",
];

export interface InstallServerOptions {
  signal?: AbortSignal;
  resolveOnEulaFile?: boolean;
}

export function installServer(
  command: string,
  args: string[],
  serverPath: string,
  onOutput?: (message: string) => void,
  options: InstallServerOptions = {},
) {
  const signal = options.signal;

  return new Promise((resolve, reject) => {
    let settled = false;
    let eulaPoll: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const stopWatchers = () => {
      if (eulaPoll) clearInterval(eulaPoll);
      if (timeoutId) clearTimeout(timeoutId);
      eulaPoll = null;
      timeoutId = null;
    };

    const settleResolve = (value: any) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (server.exitCode === null && server.signalCode === null) {
        void terminateProcessTree(server).finally(() => resolve(value));
        return;
      }

      resolve(value);
    };

    const settleReject = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      void terminateProcessTree(server).finally(() => reject(err));
    };

    const server = spawn(command, args, { cwd: serverPath });

    const onStdout = (data: any) => {
      const output = data.toString();
      onOutput?.(output);
      if (SERVER_READY_MARKERS.some((marker) => output.includes(marker))) {
        settleResolve("done");
      }
    };

    const onStderr = (data: any) => {
      onOutput?.(data.toString());
    };

    const onClose = (code: any) => {
      if (code === 0 || code === null) {
        settleResolve(code);
        return;
      }

      settleReject(new Error(`Server installer exited with code ${code}`));
    };

    const onError = (err: any) => {
      settleReject(err);
    };

    const onAbort = () => settleReject(new Error("AbortError"));

    function cleanup() {
      stopWatchers();
      try {
        signal?.removeEventListener("abort", onAbort);
        server.stdout?.off("data", onStdout);
        server.stderr?.off("data", onStderr);
        server.off("close", onClose);
        server.off("error", onError);
      } catch {}
    }

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort);

    server.stdout?.on("data", onStdout);
    server.stderr?.on("data", onStderr);
    server.on("close", onClose);
    server.on("error", onError);

    if (options.resolveOnEulaFile) {
      const eulaPath = path.join(serverPath, "eula.txt");
      eulaPoll = setInterval(() => {
        if (fs.existsSync(eulaPath)) settleResolve("done");
      }, 1000);
    }

    timeoutId = setTimeout(() => {
      settleReject(new Error("Server installer timed out"));
    }, SERVER_INSTALL_TIMEOUT_MS);
  });
}

export async function closeGame(versionName: string, instance: number) {
  const instanceKey = `${versionName}-${instance}`;
  const javaProcess = gameProcesses.get(instanceKey);
  if (!javaProcess) return;

  javaProcess.killedByUser = true;

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
  stats?: Pick<
    SessionContext,
    "trackStatistics" | "accountSub" | "accountLabel"
  >,
  highPriority: boolean = false,
) {
  if (gameRuntime.isInstanceBusy(versionName, instance)) {
    throw new Error(`Game instance ${versionName}-${instance} is already running`);
  }

  const instanceKey = `${versionName}-${instance}`;

  safeSend("consoleClear", versionName, instance);
  rpc.setGameLaunching({ versionName, instance, serverAddress });

  const javaProcess = spawn(command, args, {
    cwd: versionPath,
  });

  javaProcess.once("spawn", () => {
    if (highPriority && javaProcess.pid) {
      try {
        os.setPriority(
          javaProcess.pid,
          os.constants.priority.PRIORITY_ABOVE_NORMAL,
        );
      } catch (error) {
        console.warn("Failed to raise game process priority:", error);
      }
    }
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

  if (stats) {
    beginSession({
      versionName,
      versionPath,
      instance,
      trackStatistics: stats.trackStatistics,
      accountSub: stats.accountSub,
      accountLabel: stats.accountLabel,
    });
  }

  let netstatInFlight = false;
  let intervalId: NodeJS.Timeout | null = null;
  let launchAnnounced = false;
  let processFinalized = false;

  const checkConnection = (): void => {
    const processData = gameProcesses.get(instanceKey);
    if (!processData || !processData.serverPort) return;

    if (netstatInFlight) return;
    netstatInFlight = true;

    try {
      let matchingConnections = 0;
      let ownedByGame = 0;
      let sawPidInfo = false;

      const finish = () => {
        try {
          const stillData = gameProcesses.get(instanceKey);
          if (!stillData || stillData.serverPort !== processData.serverPort)
            return;

          const connected = sawPidInfo
            ? ownedByGame > 0
            : matchingConnections > 0;
          if (connected) return;

          safeSend("friendUpdate", { serverAddress: "" });
          stillData.serverPort = null;
          rpc.updateGameServer(versionName, instance);
        } finally {
          netstatInFlight = false;
        }
      };

      netstat(
        {
          filter: {
            remote: { port: processData.serverPort },
            protocol: "tcp",
          },
          done: finish,
        },
        (item: any) => {
          if (item.state != "ESTABLISHED") return;

          matchingConnections += 1;

          if (typeof item.pid === "number" && item.pid > 0) {
            sawPidInfo = true;
            if (item.pid === javaProcess.pid) ownedByGame += 1;
          }
        },
      );
    } catch {
      netstatInFlight = false;
    }
  };

  intervalId = setInterval(checkConnection, 15000);

  const CONSOLE_FLUSH_MS = 100;
  const pendingConsoleMessages: IConsoleMessage[] = [];
  let consoleFlushTimer: NodeJS.Timeout | null = null;

  const flushConsoleMessages = () => {
    if (consoleFlushTimer) {
      clearTimeout(consoleFlushTimer);
      consoleFlushTimer = null;
    }
    if (pendingConsoleMessages.length === 0) return;

    const batch = pendingConsoleMessages.splice(0);
    const merged: IConsoleMessage[] = [];
    for (const msg of batch) {
      const last = merged[merged.length - 1];
      if (last && last.type === msg.type) {
        last.message += msg.message;
      } else {
        merged.push({ ...msg, tips: [...msg.tips] });
      }
    }

    for (const msg of merged) {
      safeSend("consoleMessage", versionName, instance, msg);
    }
  };

  const queueConsoleMessage = (msg: IConsoleMessage) => {
    pendingConsoleMessages.push(msg);
    if (!consoleFlushTimer) {
      consoleFlushTimer = setTimeout(flushConsoleMessages, CONSOLE_FLUSH_MS);
    }
  };

  const handleServerConnectionMessage = (message: string) => {
    const connection = parseMinecraftServerConnectionLine(message);
    if (!connection) return;

    const processData = gameProcesses.get(instanceKey);
    if (!processData) return;

    processData.serverPort = connection.serverPort;
    setSessionServer(
      versionName,
      instance,
      `${connection.serverAddress}:${connection.serverPort}`,
    );
    gameRuntime.emitServerConnection({
      key: instanceKey,
      versionName,
      instance,
      serverAddress: connection.serverAddress,
      serverPort: connection.serverPort,
    });
    safeSend("friendUpdate", {
      serverAddress: `${connection.serverAddress}:${connection.serverPort}`,
    });
    rpc.updateGameServer(
      versionName,
      instance,
      `${connection.serverAddress}:${connection.serverPort}`,
    );
  };

  const stdoutReader = createLineReader((message) => {
    gameRuntime.emitStdout({
      key: instanceKey,
      versionName,
      instance,
      message,
    });

    if (
      !launchAnnounced &&
      (message.includes("Setting gameDir") || message.includes("Setting user"))
    ) {
      launchAnnounced = true;
      markSessionReady(versionName, instance);
      safeMinimize();
      safeSend("launch");
    }

    handleServerConnectionMessage(message);

    queueConsoleMessage({
      type: classifyConsoleStream(message, "stdout"),
      message,
      tips: [],
    });
  });

  const stderrReader = createLineReader((message) => {
    gameRuntime.emitStderr({
      key: instanceKey,
      versionName,
      instance,
      message,
    });

    handleServerConnectionMessage(message);

    queueConsoleMessage({
      type: classifyConsoleStream(message, "stderr"),
      message,
      tips: [],
    });
  });

  javaProcess.stdout?.on("data", (data: Buffer) => stdoutReader.push(data));
  javaProcess.stderr?.on("data", (data: Buffer) => stderrReader.push(data));

  javaProcess.on("error", (err) => {
    if (processFinalized) return;
    processFinalized = true;

    if (intervalId) clearInterval(intervalId);
    flushConsoleMessages();

    void endSession(versionName, instance, 1).finally(() =>
      safeSend("playtimeRecorded"),
    );

    gameRuntime.unregister(versionName, instance, javaProcess);
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
    if (processFinalized) return;
    processFinalized = true;

    stdoutReader.flush();
    stderrReader.flush();
    flushConsoleMessages();

    const killedByUser =
      gameProcesses.get(instanceKey)?.killedByUser === true;

    let code = typeof c === "number" ? c : 0;
    if (c === null && signal && !killedByUser && signal !== "SIGTERM") {
      code = SIGNAL_EXIT_BASE + (os.constants.signals[signal] ?? 0);
    }
    if (signal == "SIGTERM" || killedByUser) code = 0;

    void endSession(versionName, instance, code).finally(() =>
      safeSend("playtimeRecorded"),
    );

    const msg: IConsoleMessage = {
      type: "info",
      message: killedByUser ? `Game stopped` : `Game closed with code ${code}`,
      tips: [],
    };

    if (code === 0) {
      safeSend("consoleChangeStatus", versionName, instance, "stopped");
      msg.type = "success";
    } else {
      safeSend("consoleChangeStatus", versionName, instance, "error");
      msg.type = "error";
      msg.tips.push("checkIntegrity");

      void analyzeGameCrash(versionPath, code)
        .then((analysis) => {
          if (!analysis) return;
          safeSend("crashAnalysis", versionName, instance, analysis);
        })
        .catch(() => {});
    }

    safeSend("consoleMessage", versionName, instance, msg);

    if (intervalId) clearInterval(intervalId);

    gameRuntime.unregister(versionName, instance, javaProcess);
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
