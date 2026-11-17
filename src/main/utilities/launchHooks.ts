import { spawn } from "child_process";

export interface LaunchHookContext {
  instanceName: string;
  instanceDir: string;
  gameDir: string;
  javaPath: string;
  env: NodeJS.ProcessEnv;
}

export interface LaunchHookResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

const HOOK_TIMEOUT_MS = 2 * 60 * 1000;
const OUTPUT_TAIL_CHARS = 600;

export function hookEnvironment(context: LaunchHookContext): NodeJS.ProcessEnv {
  return {
    ...context.env,
    INST_NAME: context.instanceName,
    INST_ID: context.instanceName,
    INST_DIR: context.instanceDir,
    INST_MC_DIR: context.gameDir,
    INST_JAVA: context.javaPath,
  };
}

export function runLaunchHook(
  command: string,
  context: LaunchHookContext,
  timeoutMs: number = HOOK_TIMEOUT_MS,
): Promise<LaunchHookResult> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let settled = false;

    const child = spawn("/bin/sh", ["-c", command], {
      cwd: context.gameDir,
      env: hookEnvironment(context),
      windowsHide: true,
    });

    const collect = (data: Buffer) => {
      output = (output + data.toString()).slice(-OUTPUT_TAIL_CHARS);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, output: output.trim(), timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      finish(null);
    }, timeoutMs);

    child.once("error", (error) => {
      output = error.message;
      finish(null);
    });
    child.once("close", (code) => finish(code));
  });
}
