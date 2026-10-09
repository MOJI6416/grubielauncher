import { BrowserWindow, dialog } from "electron";
import type { IVersionConf } from "@/types/IVersion";
import {
  isAbsoluteJavaHome,
  isValidJavaMajor,
  normalizeJavaOverride,
  type JavaAddResult,
  type JavaOverride,
  type JavaPrepareResult,
  type JavaRuntimeList,
  type ResolvedJava,
} from "@/shared/javaRuntime";
import { check, handleSafe } from "../utilities/ipc";
import {
  addCustomJava,
  listJavaRuntimes,
  removeCustomJava,
  resolveJava,
  setJavaDefault,
} from "../game/javaRuntimes";
import { Java } from "../game/Java";
import { Version } from "../game/Version";
import { tryBeginInstallOperation } from "./installLock";
import { resumeDownloads } from "../utilities/downloader";

const EMPTY_LIST: JavaRuntimeList = { runtimes: [], defaults: {}, scannedAt: 0 };

function pickerOptions(): Electron.OpenDialogOptions {
  if (process.platform === "win32") {
    return {
      properties: ["openFile", "dontAddToRecent"],
      defaultPath: process.env.ProgramFiles || undefined,
      filters: [{ name: "Java", extensions: ["exe"] }],
    };
  }

  if (process.platform === "darwin") {
    return {
      properties: ["openFile", "openDirectory", "treatPackageAsDirectory"],
      defaultPath: "/Library/Java/JavaVirtualMachines",
    };
  }

  return { properties: ["openFile", "openDirectory"], defaultPath: "/usr/lib/jvm" };
}

async function installMissing(
  java: ResolvedJava,
  label: string,
  resolve: () => Promise<ResolvedJava>,
): Promise<JavaPrepareResult> {
  if (!java.problem) return { ok: true, java };
  if (java.problem !== "not_installed") {
    return { ok: false, problem: java.problem, java };
  }

  const lock = tryBeginInstallOperation(() => {});
  if (!lock) return { ok: false, problem: "busy", java };

  resumeDownloads();

  try {
    await new Java(java.major).install(lock.controller.signal, label);
    const next = await resolve();
    return next.problem
      ? { ok: false, problem: next.problem, java: next }
      : { ok: true, java: next };
  } catch (error) {
    console.error(`[java] could not install Java ${java.major} for ${label}:`, error);
    return { ok: false, problem: "download_failed", java };
  } finally {
    resumeDownloads();
    lock.end();
  }
}

async function prepareJava(conf: IVersionConf): Promise<JavaPrepareResult> {
  const vm = new Version(conf);
  await vm.init();
  if (!vm.manifest) return { ok: false, problem: "not_installed", java: null };

  const java = vm.java ?? (await vm.resolveJavaRuntime());
  return installMissing(java, conf.name, () => vm.resolveJavaRuntime());
}

async function ensureJava(
  requiredMajor: number,
  override: JavaOverride | undefined,
): Promise<JavaPrepareResult> {
  const resolve = () => resolveJava({ requiredMajor, override });
  return installMissing(await resolve(), `Java ${requiredMajor}`, resolve);
}

export function registerJavaIpc() {
  handleSafe<JavaRuntimeList, [boolean?]>(
    "java:list",
    EMPTY_LIST,
    [check.optional(check.boolean())],
    (_, rescan) => listJavaRuntimes({ rescan: rescan === true }),
  );

  handleSafe<JavaAddResult>(
    "java:add",
    { ok: false, reason: "failed" },
    async (event) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options = pickerOptions();
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      const chosen = result.canceled ? null : result.filePaths[0];
      if (!chosen) return { ok: false, reason: "cancelled" };

      return addCustomJava(chosen);
    },
  );

  handleSafe<JavaRuntimeList, [string]>(
    "java:remove",
    EMPTY_LIST,
    [(value) => isAbsoluteJavaHome(value)],
    (_, home) => removeCustomJava(home),
  );

  handleSafe<JavaRuntimeList | null, [number, string | null]>(
    "java:setDefault",
    null,
    [
      (value) => isValidJavaMajor(value),
      (value) => value === null || isAbsoluteJavaHome(value),
    ],
    (_, major, home) => setJavaDefault(major, home),
  );

  handleSafe<JavaPrepareResult, [number, JavaOverride | null]>(
    "java:ensure",
    { ok: false, problem: "not_installed", java: null },
    [
      (value) => isValidJavaMajor(value),
      (value) => value === null || normalizeJavaOverride(value) !== undefined,
    ],
    (_, requiredMajor, override) =>
      ensureJava(requiredMajor, normalizeJavaOverride(override)),
  );

  handleSafe<JavaPrepareResult, [IVersionConf]>(
    "java:prepare",
    { ok: false, problem: "not_installed", java: null },
    [check.object()],
    (_, conf) => prepareJava(conf),
  );
}
