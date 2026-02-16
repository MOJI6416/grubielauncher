import { spawn } from "child_process";
import { gameProcesses } from "../ipc/gameIpc";
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

export function closeGame(versionName: string, instance: number) {
  const instanceKey = `${versionName}-${instance}`;
  const javaProcess = gameProcesses.get(instanceKey);
  if (javaProcess) {
    try {
      javaProcess.process.kill();
    } catch {}
    gameProcesses.delete(instanceKey);
  }
}

export function runGame(
  command: string,
  args: string[],
  versionPath: string,
  versionName: string,
  instance: number,
  accessToken: string,
) {
  const instanceKey = `${versionName}-${instance}`;

  safeSend("consoleClear", versionName, instance);

  const javaProcess = spawn(command, args, {
    cwd: versionPath,
  });

  gameProcesses.set(instanceKey, {
    process: javaProcess,
    serverPort: null,
    accessToken,
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
        safeSend("friendUpdate", {
          serverAddress: `${serverAddress}:${processData.serverPort}`,
        });
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
    const msg: IConsoleMessage = {
      type: "error",
      message: data.toString(),
      tips: [],
    };
    safeSend("consoleMessage", versionName, instance, msg);
  });

  javaProcess.on("error", (err) => {
    if (intervalId) clearInterval(intervalId);

    gameProcesses.delete(instanceKey);

    const msg: IConsoleMessage = {
      type: "error",
      message: `Game process failed to start: ${(err as Error)?.message || String(err)}`,
      tips: ["checkIntegrity"],
    };

    safeSend("consoleChangeStatus", versionName, instance, "error");
    safeSend("consoleMessage", versionName, instance, msg);

    safeRestoreIfMinimized();

    safeSend("launch");
    try {
      rpc.updateActivity();
    } catch {}
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

    safeSend("consolePublicAddress", versionName, instance, undefined);

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

    gameProcesses.delete(instanceKey);

    safeRestoreIfMinimized();

    safeSend("launch");
    try {
      rpc.updateActivity();
    } catch {}

    safeSend("friendUpdate", {
      versionName: "",
      versionCode: "",
      serverAddress: "",
    });
  });
}
