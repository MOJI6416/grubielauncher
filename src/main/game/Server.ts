import { IServerConf, ServerCore } from "@/types/Server";
import { Java } from "./Java";
import { IVersionConf } from "@/types/IVersion";
import { ILocalAccount } from "@/types/Account";
import { app } from "electron";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import { getJavaAgent, HTTP_AGENT_JVM_ARGUMENT } from "../utilities/other";
import { Downloader } from "../utilities/downloader";
import fs from "fs-extra";
import { installServer } from "../utilities/game";
import { Backend } from "../services/Backend";
import { mainWindow, setRunningServersProbe } from "../windows/mainWindow";
import {
  VersionInstallProgress,
  VersionInstallStage,
} from "@/types/InstallationProgress";
import {
  createLoaderInstallerProgressState,
  parseLoaderInstallerProgressLine,
} from "../utilities/loaderInstallerProgress";
import {
  assertSafeFileSegment,
  assertSafeRelativePath,
  toArgfilePath,
  validateServerMemory,
} from "./serverScriptSafety";
import {
  AIKAR_FLAGS,
  isServerRunning,
  setServerRunning,
} from "../utilities/serverManager";
import {
  classifyRunArguments,
  filterRunArguments,
  isAllowedJvmArgument,
} from "@/shared/runArguments";
import { assertTrustedServerCoreUrl } from "../utilities/trustedHosts";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import { createLineReader } from "../utilities/consoleLog";
import {
  ServerRunResult,
  ServerRunState,
  ServerRunStatus,
} from "@/types/Server";

function patchLauncherScript(
  data: string,
  javaCmd: string,
  argsToken: string,
): string {
  const javaLine = /^java\b/m;
  let patched = data;

  if (javaLine.test(patched)) {
    patched = patched.replace(javaLine, javaCmd);
  } else if (!patched.includes(javaCmd)) {
    throw new Error(
      "Loader run script has an unexpected format, the launcher could not point it at its own Java",
    );
  }

  if (!patched.includes(`nogui ${argsToken}`)) {
    patched = patched.replaceAll(argsToken, `nogui ${argsToken}`);
  }

  return patched;
}

async function writeUserJvmArgs(file: string, managed: string): Promise<void> {
  const managedLine = managed.trim();
  const preserved: string[] = [];

  try {
    const existing = await fs.readFile(file, "utf-8");

    for (const rawLine of existing.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line === managedLine) continue;
      if (/-Xm[sx]/i.test(line)) continue;
      if (line.includes("-javaagent:")) continue;
      if (line.includes(HTTP_AGENT_JVM_ARGUMENT)) continue;

      const { safe, rejected } = filterRunArguments(
        tokenizeRunScriptLine(line, true),
        "jvm",
      );
      if (rejected.length > 0) {
        console.error(
          `[server] dropped unsafe user_jvm_args.txt arguments: ${rejected.join(" ")}`,
        );
      }
      if (safe.length > 0) preserved.push(safe.join(" "));
    }
  } catch {}

  await fs.writeFile(
    file,
    [managedLine, ...preserved].filter(Boolean).join("\n"),
    "utf-8",
  );
}

const RUN_SCRIPT_MARKERS = ["-jar", "@user_jvm_args.txt", "@libraries"];
const RUN_SCRIPT_EXECUTABLES = new Set([
  "java",
  "javaw",
  "java.exe",
  "javaw.exe",
]);
function runScriptBasename(command: string): string {
  const separator = Math.max(
    command.lastIndexOf("/"),
    command.lastIndexOf("\\"),
  );
  return separator === -1 ? command : command.slice(separator + 1);
}

const RUN_SCRIPT_ARGFILE =
  /^@(?:user_jvm_args\.txt|libraries\/[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*\.txt)$/i;
const RUN_SCRIPT_JAR = /^[A-Za-z0-9._+-]+\.jar$/;
const RUN_SCRIPT_NOISE = /^(?:[@#:]|echo\b|pause\b|rem\b|set\b|title\b|cd\b|read\b|exit\b|goto\b|if\b)/i;
const RUN_SCRIPT_PASSTHROUGH = new Set(["%*", "$@", '"$@"']);

const ARGFILE_VALUE_FLAGS = new Set([
  "-p",
  "--module-path",
  "-cp",
  "-classpath",
  "--class-path",
  "-m",
  "--module",
  "--add-opens",
  "--add-exports",
  "--add-modules",
  "--add-reads",
  "--patch-module",
  "--upgrade-module-path",
]);
const ARGFILE_PATH_FLAGS = new Set([
  "-p",
  "--module-path",
  "-cp",
  "-classpath",
  "--class-path",
]);
const ARGFILE_PATH_ENTRY = /^[A-Za-z0-9_.+-][A-Za-z0-9_.+/-]*$/;
const ARGFILE_MAIN_CLASS =
  /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/;
const ARGFILE_AUTHLIB_AGENT_PREFIX = "-javaagent:";
const ARGFILE_AUTHLIB_AGENT_BODY =
  /^libraries\/[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*\.jar=(?:ely\.by|grubielauncher\.com)$/i;

const SERVER_LOG_LINES = 300;
const SERVER_OUTPUT_FLUSH_MS = 200;
const SERVER_GRACEFUL_STOP_MS = 30_000;
const SERVER_TERMINATE_MS = 10_000;
const SERVER_QUIT_WAIT_MS = 30_000;

export function tokenizeRunScriptLine(line: string, posix: boolean): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (posix && char === "\\" && index + 1 < line.length) {
      current += line[++index];
      started = true;
      continue;
    }

    if (char === '"' || (posix && char === "'")) {
      quote = char as '"' | "'";
      started = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (current || started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }

    current += char;
  }

  if (current || started) tokens.push(current);
  return tokens;
}

export function isLauncherRunScriptArgfile(arg: string): boolean {
  const normalized = arg.replace(/\\/g, "/");
  if (normalized.split("/").includes("..")) return false;

  return RUN_SCRIPT_ARGFILE.test(normalized);
}

export function isLauncherRunScriptEntryPoint(arg: string): boolean {
  return arg === "-jar" || arg === "nogui" || RUN_SCRIPT_JAR.test(arg);
}

function isServerRelativePath(value: string): boolean {
  if (!value || value.includes("\\")) return false;
  if (!ARGFILE_PATH_ENTRY.test(value)) return false;

  return !value.split("/").includes("..");
}

function isServerRelativePathList(value: string): boolean {
  const entries = value.split(/[;:,]/).filter((entry) => entry !== "");

  return entries.length > 0 && entries.every(isServerRelativePath);
}

export function isLauncherAuthlibAgent(token: string): boolean {
  if (!token.startsWith(ARGFILE_AUTHLIB_AGENT_PREFIX)) return false;
  if (token.split("/").includes("..")) return false;

  return ARGFILE_AUTHLIB_AGENT_BODY.test(
    token.slice(ARGFILE_AUTHLIB_AGENT_PREFIX.length),
  );
}

export function isLoaderManagedJvmArgument(token: string): boolean {
  if (isLauncherAuthlibAgent(token)) return true;

  if (!token.startsWith("-D")) return false;

  const separator = token.indexOf("=");
  if (separator === -1) return false;
  if (!isServerRelativePathList(token.slice(separator + 1))) return false;

  return isAllowedJvmArgument(`${token.slice(0, separator)}=managed`);
}

export function tokenizeArgfileContent(content: string): string[] {
  const tokens: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    tokens.push(...tokenizeRunScriptLine(line, true));
  }

  return tokens;
}

export function splitArgfileTokens(tokens: string[]): {
  jvm: string[];
  program: string[];
} {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    if (ARGFILE_VALUE_FLAGS.has(token)) {
      index++;
      continue;
    }
    if (token.startsWith("-")) continue;
    if (!ARGFILE_MAIN_CLASS.test(token)) continue;

    return { jvm: tokens.slice(0, index), program: tokens.slice(index) };
  }

  return { jvm: tokens, program: [] };
}

export function filterArgfileTokens(tokens: string[]): {
  safe: string[];
  rejected: string[];
} {
  const { jvm, program } = splitArgfileTokens(tokens);

  const pairs = new Set<number>();
  for (let index = 0; index + 1 < jvm.length; index++) {
    if (!ARGFILE_PATH_FLAGS.has(jvm[index])) continue;
    if (!isServerRelativePathList(jvm[index + 1])) continue;

    pairs.add(index);
    pairs.add(index + 1);
    index++;
  }

  const allowed = classifyRunArguments(jvm, "jvm", isLoaderManagedJvmArgument);
  const safe: string[] = [];
  const rejected: string[] = [];

  jvm.forEach((token, index) => {
    if (allowed[index] || pairs.has(index)) safe.push(token);
    else rejected.push(token);
  });

  const tail = filterRunArguments(program, "game");

  return {
    safe: [...safe, ...tail.safe],
    rejected: [...rejected, ...tail.rejected],
  };
}

export async function expandServerArgfiles(
  serverPath: string,
  args: string[],
): Promise<string[]> {
  const expanded: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith("@")) {
      expanded.push(arg);
      continue;
    }

    if (!isLauncherRunScriptArgfile(arg)) {
      console.error(`[server] dropped unknown run script argfile: ${arg}`);
      continue;
    }

    const argfilePath = path.join(
      serverPath,
      ...arg.slice(1).replace(/\\/g, "/").split("/"),
    );

    let content: string;
    try {
      content = await fs.readFile(argfilePath, "utf-8");
    } catch {
      console.error(`[server] unreadable run script argfile: ${arg}`);
      continue;
    }

    const { safe, rejected } = filterArgfileTokens(
      tokenizeArgfileContent(content),
    );
    if (rejected.length > 0) {
      console.error(
        `[server] dropped unsafe arguments from ${arg}: ${rejected.join(" ")}`,
      );
    }

    expanded.push(...safe);
  }

  return expanded;
}

export function isTrustedServerJavaCommand(
  command: string,
  expectedJavaPath: string,
): boolean {
  if (!RUN_SCRIPT_EXECUTABLES.has(runScriptBasename(command).toLowerCase())) {
    return false;
  }

  if (!path.isAbsolute(command)) return false;

  const managedRoot = path.resolve(
    app.getPath("appData"),
    ".grubielauncher",
    "java",
  );

  const relative = path.relative(managedRoot, path.resolve(command));
  const segments = relative ? relative.split(path.sep) : [];

  if (
    segments.length > 2 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    segments[segments.length - 2].toLowerCase() === "bin"
  ) {
    return true;
  }

  if (!expectedJavaPath || !path.isAbsolute(expectedJavaPath)) return false;

  const left = path.resolve(command);
  const right = path.resolve(expectedJavaPath);

  return process.platform === "win32" || process.platform === "darwin"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function resolveRunScriptJava(
  scriptCommand: string,
  expectedJava: string,
): { command: string; repointedFrom: string | null } | null {
  if (isTrustedServerJavaCommand(scriptCommand, expectedJava)) {
    return { command: scriptCommand, repointedFrom: null };
  }

  if (!expectedJava) return null;

  return { command: expectedJava, repointedFrom: scriptCommand };
}

export function parseRunScript(
  content: string,
  posix: boolean,
): { command: string; args: string[] } | null {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || RUN_SCRIPT_NOISE.test(line)) continue;
    if (!RUN_SCRIPT_MARKERS.some((marker) => line.includes(marker))) continue;

    const tokens = tokenizeRunScriptLine(line, posix).filter(
      (token) => !RUN_SCRIPT_PASSTHROUGH.has(token),
    );
    const [command, ...args] = tokens;
    if (!command) continue;
    if (!RUN_SCRIPT_EXECUTABLES.has(runScriptBasename(command).toLowerCase())) {
      continue;
    }

    const { safe, rejected } = filterRunArguments(
      args,
      "jvm",
      (arg) =>
        isLauncherRunScriptArgfile(arg) ||
        isLauncherRunScriptEntryPoint(arg) ||
        isLoaderManagedJvmArgument(arg),
    );
    if (rejected.length > 0) {
      console.error(
        `[server] dropped unsafe run script arguments: ${rejected.join(" ")}`,
      );
    }

    return { command, args: safe };
  }

  return null;
}

type RunningServer = {
  child: ChildProcess;
  state: ServerRunState;
  startedAt: number;
  log: string[];
  pending: string[];
  flushTimer: NodeJS.Timeout | null;
  stopTimer: NodeJS.Timeout | null;
  killTimer: NodeJS.Timeout | null;
};

const runningServers = new Map<string, RunningServer>();

function broadcast(channel: string, payload: unknown) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isDestroyed()) return;

  try {
    mainWindow.webContents.send(channel, payload);
  } catch {}
}

function setState(serverPath: string, entry: RunningServer, state: ServerRunState) {
  entry.state = state;
  broadcast("server:state", {
    serverPath,
    state,
    pid: entry.child.pid ?? null,
    startedAt: entry.startedAt,
  });
}

function flushOutput(serverPath: string, entry: RunningServer) {
  entry.flushTimer = null;
  if (entry.pending.length === 0) return;

  const lines = entry.pending.splice(0);
  broadcast("server:output", { serverPath, lines });
}

function pushOutput(serverPath: string, entry: RunningServer, line: string) {
  const trimmed = line.trimEnd();
  if (!trimmed) return;

  entry.log.push(trimmed);
  if (entry.log.length > SERVER_LOG_LINES) {
    entry.log.splice(0, entry.log.length - SERVER_LOG_LINES);
  }

  entry.pending.push(trimmed);
  if (!entry.flushTimer) {
    entry.flushTimer = setTimeout(
      () => flushOutput(serverPath, entry),
      SERVER_OUTPUT_FLUSH_MS,
    );
  }
}

function clearTimers(entry: RunningServer) {
  if (entry.stopTimer) clearTimeout(entry.stopTimer);
  if (entry.killTimer) clearTimeout(entry.killTimer);
  entry.stopTimer = null;
  entry.killTimer = null;
}

function forceKill(entry: RunningServer) {
  const pid = entry.child.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
      }).unref();
    } catch {}
    return;
  }

  try {
    entry.child.kill("SIGKILL");
  } catch {}
}

async function resolveServerJavaPath(serverPath: string): Promise<string> {
  const conf = await fs
    .readJSON(path.join(serverPath, "conf.json"))
    .catch(() => null);
  const major =
    typeof conf?.javaMajorVersion === "number" && conf.javaMajorVersion > 0
      ? conf.javaMajorVersion
      : 21;

  try {
    const java = new Java(major);
    await java.init();
    if (!java.javaServerPath) await java.useSystemJava();

    return java.javaServerPath;
  } catch {
    return "";
  }
}

export async function startServer(
  serverPath: string,
): Promise<ServerRunResult> {
  const key = path.resolve(serverPath);
  const existing = runningServers.get(key);
  if (existing) return { ok: false, error: "server_already_running" };
  if (await isServerRunning(key)) {
    return { ok: false, error: "server_already_running" };
  }

  const posix = process.platform !== "win32";
  const scriptPath = path.join(key, posix ? "run.sh" : "run.bat");

  if (!(await fs.pathExists(scriptPath))) {
    return { ok: false, error: "server_run_script_missing" };
  }

  const parsed = parseRunScript(
    await fs.readFile(scriptPath, "utf-8"),
    posix,
  );
  if (!parsed) return { ok: false, error: "server_run_script_unreadable" };

  const expectedJava = await resolveServerJavaPath(key);
  let resolved = resolveRunScriptJava(parsed.command, expectedJava);

  if (resolved && !(await fs.pathExists(resolved.command)) && expectedJava) {
    resolved = { command: expectedJava, repointedFrom: parsed.command };
  }

  if (!resolved || !(await fs.pathExists(resolved.command))) {
    console.error(
      `[server] no usable Java runtime for the run script command ${parsed.command}`,
    );
    return { ok: false, error: "server_java_unavailable" };
  }

  const { command: javaCommand, repointedFrom } = resolved;

  const args = await expandServerArgfiles(key, parsed.args);

  let child: ChildProcess;
  try {
    child = spawn(path.resolve(javaCommand), args, {
      cwd: key,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const entry: RunningServer = {
    child,
    state: "starting",
    startedAt: Date.now(),
    log: [],
    pending: [],
    flushTimer: null,
    stopTimer: null,
    killTimer: null,
  };

  runningServers.set(key, entry);
  setServerRunning(key, true);
  setState(key, entry, "starting");

  if (repointedFrom) {
    pushOutput(
      key,
      entry,
      `[launcher] the run script pointed at ${repointedFrom}, started with ${javaCommand} instead`,
    );
  }

  const stdoutReader = createLineReader((line) => {
    pushOutput(key, entry, line);
    if (entry.state === "starting" && /\bDone \(|For help, type/i.test(line)) {
      setState(key, entry, "running");
    }
  });
  const stderrReader = createLineReader((line) => pushOutput(key, entry, line));

  child.stdout?.on("data", (chunk: Buffer) => stdoutReader.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderrReader.push(chunk));

  child.on("error", (error) => {
    pushOutput(key, entry, `[launcher] ${error.message}`);
  });

  child.on("close", (code, signal) => {
    stdoutReader.flush();
    stderrReader.flush();
    pushOutput(
      key,
      entry,
      `[launcher] server stopped (code ${code ?? "none"}, signal ${signal ?? "none"})`,
    );

    clearTimers(entry);
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = null;
    flushOutput(key, entry);

    runningServers.delete(key);
    setServerRunning(key, false);
    broadcast("server:state", {
      serverPath: key,
      state: "stopped",
      pid: null,
      startedAt: null,
    });
  });

  return { ok: true };
}

export async function stopServer(
  serverPath: string,
  force = false,
): Promise<ServerRunResult> {
  const key = path.resolve(serverPath);
  const entry = runningServers.get(key);
  if (!entry) {
    return (await isServerRunning(key))
      ? { ok: false, error: "server_not_managed" }
      : { ok: false, error: "server_not_running" };
  }

  if (force) {
    clearTimers(entry);
    setState(key, entry, "stopping");
    forceKill(entry);
    return { ok: true };
  }

  if (entry.state === "stopping") return { ok: true };

  setState(key, entry, "stopping");

  try {
    entry.child.stdin?.write("stop\n");
  } catch {}

  entry.stopTimer = setTimeout(() => {
    try {
      entry.child.kill();
    } catch {}

    entry.killTimer = setTimeout(() => forceKill(entry), SERVER_TERMINATE_MS);
  }, SERVER_GRACEFUL_STOP_MS);

  return { ok: true };
}

export async function sendServerCommand(
  serverPath: string,
  command: string,
): Promise<ServerRunResult> {
  const key = path.resolve(serverPath);
  const entry = runningServers.get(key);

  if (!entry) {
    return (await isServerRunning(key))
      ? { ok: false, error: "server_not_managed" }
      : { ok: false, error: "server_not_running" };
  }

  const line = command.replace(/[\r\n]+/g, " ").trim().slice(0, 512);
  if (!line) return { ok: false, error: "server_command_empty" };

  try {
    entry.child.stdin?.write(`${line}\n`);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  pushOutput(key, entry, `> ${line}`);

  return { ok: true };
}

export async function getServerRunStatus(
  serverPath: string,
): Promise<ServerRunStatus> {
  const key = path.resolve(serverPath);
  const entry = runningServers.get(key);

  if (entry) {
    return {
      serverPath: key,
      state: entry.state,
      pid: entry.child.pid ?? null,
      startedAt: entry.startedAt,
      log: [...entry.log],
    };
  }

  return {
    serverPath: key,
    state: (await isServerRunning(key)) ? "running" : "stopped",
    pid: null,
    startedAt: null,
    log: [],
  };
}

function waitForServersToExit(timeoutMs: number): Promise<void> {
  if (runningServers.size === 0) return Promise.resolve();

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      if (runningServers.size === 0 || Date.now() >= deadline) {
        clearInterval(poll);
        resolve();
      }
    }, 250);
  });
}

let quitRequested = false;
let serversShutdownDone = false;
let serversShutdown: Promise<void> | null = null;

export function hasRunningServers() {
  return runningServers.size > 0;
}

setRunningServersProbe(hasRunningServers);

export async function stopAllServers(): Promise<void> {
  if (runningServers.size === 0) return;

  for (const key of [...runningServers.keys()]) void stopServer(key);
  await waitForServersToExit(SERVER_QUIT_WAIT_MS);
  if (runningServers.size === 0) return;

  console.warn(
    `[server:quit] ${runningServers.size} server(s) did not stop in ${SERVER_QUIT_WAIT_MS}ms, terminating`,
  );
  for (const entry of runningServers.values()) forceKill(entry);
  await waitForServersToExit(SERVER_TERMINATE_MS);
}

export function stopServersForShutdown(): Promise<void> {
  if (serversShutdown) return serversShutdown;
  if (runningServers.size === 0) return Promise.resolve();

  serversShutdown = stopAllServers();

  return serversShutdown;
}

app.on("before-quit", (event) => {
  if (serversShutdownDone || runningServers.size === 0) return;

  event.preventDefault();
  if (quitRequested) return;
  quitRequested = true;

  void stopServersForShutdown().finally(() => {
    serversShutdownDone = true;
    app.quit();
  });
});

export class ServerGame {
  private serverPath: string = "";
  private versionPath: string = "";
  private version: IVersionConf | undefined = undefined;
  private serverConf: IServerConf | null = null;
  private downloadLimit: number = 6;
  private account: ILocalAccount | undefined = undefined;
  private downloader: Downloader;
  private signal: AbortSignal | undefined = undefined;

  constructor(
    account: ILocalAccount | undefined,
    downloadLimit: number,
    versionPath: string,
    serverPath: string,
    conf: IServerConf,
    version?: IVersionConf,
  ) {
    this.account = account;
    this.versionPath = versionPath;
    this.serverPath = serverPath;
    this.version = version;
    this.serverConf = conf;
    this.downloadLimit = downloadLimit;
    this.downloader = new Downloader(this.downloadLimit);
    this.downloader.versionName = this.installTargetName() || null;
  }

  private async resolveJavaMajorVersion(): Promise<number> {
    const mcId = this.version?.version?.id;
    const fallback =
      this.serverConf?.javaMajorVersion ??
      (mcId ? mcVersionToJavaMajor(mcId) : 21);
    if (!mcId || !this.versionPath) return fallback;
    try {
      const manifest = await fs.readJSON(
        path.join(this.versionPath, `${mcId}.json`),
      );
      const major = manifest?.javaVersion?.majorVersion;
      if (typeof major === "number" && major > 0) return major;
    } catch {}
    return fallback;
  }

  private installTargetName(): string {
    return this.version?.name || this.serverConf?.core || "";
  }

  private sendInstallProgress(
    stage: VersionInstallStage,
    progressPercent: number,
    subProgress?: VersionInstallProgress["subProgress"],
  ) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;

    const info: VersionInstallProgress | null =
      stage === "done"
        ? null
        : {
            versionName: this.installTargetName(),
            loaderName: this.version?.loader.name || "vanilla",
            operation: "server",
            stage,
            progressPercent,
            isIndeterminate: true,
            subProgress,
          };

    try {
      mainWindow.webContents.send("versionInstallProgress", info);
    } catch {}
  }

  cancel() {
    this.downloader.cancelDownload();
  }

  private throwIfCancelled() {
    if (this.signal?.aborted) throw new Error("AbortError");
  }

  async install(options?: {
    keepProgressOpen?: boolean;
    signal?: AbortSignal;
  }) {
    if (!this.serverConf) return;

    this.signal = options?.signal;

    await fs.ensureDir(this.serverPath);

    let ok = false;
    try {
      await this.installInternal();
      ok = true;
    } finally {
      if (!ok || !options?.keepProgressOpen) {
        this.sendInstallProgress("done", 100);
      }
    }
  }

  private getValidatedMemory(): number {
    return validateServerMemory(this.serverConf?.memory);
  }

  private async installInternal() {
    if (!this.serverConf) return;

    const memory = this.getValidatedMemory();
    const memoryArgs = this.serverConf.aikarFlags
      ? `-Xms${memory}M -Xmx${memory}M ${AIKAR_FLAGS}`
      : `-Xmx${memory}M`;
    assertSafeFileSegment(this.serverConf.core, "server core");

    this.sendInstallProgress("preparing", 5);

    const javaMajorVersion = await this.resolveJavaMajorVersion();
    this.serverConf.javaMajorVersion = javaMajorVersion;
    const java = new Java(javaMajorVersion);
    await java.init(this.signal);
    this.sendInstallProgress("java", 15);
    this.throwIfCancelled();
    await java.install(this.signal, this.installTargetName());
    this.throwIfCancelled();

    const javaServerResolved =
      Boolean(java.javaServerPath) &&
      (java.usingSystemJava || (await fs.pathExists(java.javaServerPath)));

    if (!javaServerResolved)
      throw new Error(
        `Java ${javaMajorVersion} runtime for the server could not be installed`,
      );

    if (!this.version || !this.account) {
      throw new Error("Server install requires version and account data");
    }

    let jar = `${this.serverConf.core}.jar`;
    const jarPath = path.join(this.serverPath, jar);

    this.sendInstallProgress("files", 35);
    const coreUrl = this.serverConf.downloads?.server;
    if (coreUrl) assertTrustedServerCoreUrl(coreUrl);

    const jarStats = await fs.stat(jarPath).catch(() => null);
    if (!jarStats || jarStats.size === 0) {
      if (!coreUrl) {
        throw new Error(
          "Server core jar is missing and no download URL is available",
        );
      }

      await this.downloader.downloadFiles(
        [
          {
            url: coreUrl,
            destination: jarPath,
            group: "server",
          },
        ],
        this.signal,
      );

      const downloadedStats = await fs.stat(jarPath).catch(() => null);
      if (!downloadedStats || downloadedStats.size === 0) {
        throw new Error(`Failed to download server core: ${coreUrl}`);
      }
    }

    const cwd = this.serverPath;
    const javaCmd = `"${java.javaServerPath}"`;
    const javaCmdSh = `'${java.javaServerPath.replaceAll("'", `'\\''`)}'`;

    const backend = new Backend();
    const needsAuthlib =
      this.account?.type != null &&
      this.account.type !== "microsoft" &&
      this.account.type !== "plain";

    let authlib: any = null;
    try {
      authlib = await backend.getAuthlib();
    } catch (error) {
      if (needsAuthlib) throw error;
      authlib = null;
    }

    if (needsAuthlib && !authlib) {
      throw new Error(
        "Failed to resolve authlib-injector for the server: players of this account type would not be able to join.",
      );
    }

    let javaagent = "";

    const params = ["-jar", jar];
    let bootstrapsServer = false;

    if (this.serverConf.core == ServerCore.QUILT) {
      params.push(
        ...["install", "server", this.version.version.id, "--download-server"],
      );
    } else if (
      this.serverConf.core == ServerCore.FORGE ||
      this.serverConf.core == ServerCore.NEOFORGE
    ) {
      params.push("--installServer");
    } else {
      params.push("nogui");
      bootstrapsServer = true;
    }

    this.sendInstallProgress("installer", 55);

    const alreadyBootstrapped =
      bootstrapsServer &&
      (await fs.pathExists(path.join(this.serverPath, "eula.txt")));

    const installerProgressState = createLoaderInstallerProgressState(55);
    const handleInstallerOutput = (message: string) => {
      for (const line of message.split(/\r?\n/)) {
        const update = parseLoaderInstallerProgressLine(
          line,
          installerProgressState,
          { startPercent: 55, endPercent: 78 },
        );
        if (!update) continue;

        this.sendInstallProgress("installer", update.progressPercent, {
          kind: "loaderInstaller",
          titleKey: "installationProgress.subProgress.loaderInstaller.title",
          progressPercent: Math.max(
            0,
            Math.min(
              100,
              Math.round(((update.progressPercent - 55) / (78 - 55)) * 100),
            ),
          ),
          isIndeterminate: false,
          detailsKey: update.detailsKey,
          detailsParams: update.detailsParams,
        });
      }
    };

    this.throwIfCancelled();

    if (!alreadyBootstrapped) {
      await installServer(
        java.javaServerPath,
        params,
        cwd,
        handleInstallerOutput,
        { resolveOnEulaFile: bootstrapsServer, signal: this.signal },
      );
    }
    this.throwIfCancelled();
    this.sendInstallProgress("loader", 80);

    if (
      this.account.type != "microsoft" &&
      this.account.type != "plain" &&
      authlib
    ) {
      const authlibPath = assertSafeRelativePath(
        authlib.path,
        "authlib library path",
      );

      javaagent = `${HTTP_AGENT_JVM_ARGUMENT} ${getJavaAgent(
        this.account.type,
        toArgfilePath(path.join("libraries", authlibPath)),
        true,
      )} `;

      await this.downloader.downloadFiles(
        [
          {
            url: authlib.url,
            destination: path.join(this.serverPath, "libraries", authlibPath),
            group: "server",
            sha1: authlib.sha1,
            size: authlib.size,
          },
        ],
        this.signal,
      );
    }

    const batPath = path.join(this.serverPath, "run.bat");
    const shPath = path.join(this.serverPath, "run.sh");

    let isCreateRunFiles = true;

    if (this.serverConf.core == ServerCore.QUILT) {
      const quiltLaunchJar = path.join(
        this.serverPath,
        "quilt-server-launch.jar",
      );

      if (!(await fs.pathExists(quiltLaunchJar))) {
        throw new Error(
          "Quilt installer did not create quilt-server-launch.jar — the installer likely failed",
        );
      }

      await fs.remove(jarPath).catch(() => {});
      await fs.rename(quiltLaunchJar, jarPath);
    } else if (
      this.serverConf.core == ServerCore.FORGE ||
      this.serverConf.core == ServerCore.NEOFORGE
    ) {
      const version = assertSafeFileSegment(
        this.version?.version.id ?? "",
        "version id",
      );
      const serverJar = path.join(
        this.serverPath,
        `minecraft_server.${version}.jar`,
      );

      const isExists = await fs.pathExists(serverJar);
      if (!isExists) {
        isCreateRunFiles = false;

        const batExists = await fs.pathExists(batPath);
        const shExists = await fs.pathExists(shPath);

        if (!batExists || !shExists) {
          throw new Error(
            `${this.serverConf.core} installer did not create run scripts — check access to maven.minecraftforge.net and libraries.minecraft.net`,
          );
        } else {
          const batData = await fs.readFile(batPath, "utf-8");
          const patchedBat = patchLauncherScript(batData, javaCmd, "%*");
          await fs.writeFile(batPath, patchedBat, "utf-8");

          const shData = await fs.readFile(shPath, "utf-8");
          const patchedSh = patchLauncherScript(shData, javaCmdSh, '"$@"');
          await fs.writeFile(shPath, patchedSh, "utf-8");
          await fs.chmod(shPath, 0o755).catch(() => {});

          const jvmArgs = path.join(this.serverPath, "user_jvm_args.txt");
          await writeUserJvmArgs(jvmArgs, `${javaagent}${memoryArgs}`);
        }
      } else {
        const core = this.serverConf.core;
        const files = await fs.readdir(this.serverPath);
        const universalJar =
          files.find((file) => /^forge-.+-universal\.jar$/i.test(file)) ??
          files.find(
            (file) => file.startsWith(`${core}-`) && file.endsWith(".jar"),
          );

        if (!universalJar) {
          throw new Error(
            `${core} installer did not create a universal server jar — the installer likely failed`,
          );
        }

        await fs.remove(jarPath).catch(() => {});
        jar = universalJar;
      }
    }

    if (isCreateRunFiles) {
      assertSafeFileSegment(jar, "server jar");
      const batData = `@echo off
${javaCmd} ${javaagent} ${memoryArgs} -jar ${jar} nogui
pause`;

      const shData = `#!/bin/sh
${javaCmdSh} ${javaagent} ${memoryArgs} -jar ${jar} nogui
read -p "Press [Enter] key to continue..."`;

      await fs.writeFile(batPath, batData, "utf-8");
      await fs.writeFile(shPath, shData, "utf-8");
      await fs.chmod(shPath, 0o755).catch(() => {});
    }

    return;
  }
}
