import { execFile } from "child_process";
import path from "path";
import fs from "fs-extra";
import {
  WINDOWS_GPU_PREFERENCES_KEY,
  linuxGpuEnvironment,
  mergeWindowsGpuValue,
  parseRegQueryValue,
  windowsGpuPreferenceCode,
  type GpuPreference,
} from "@/shared/gpuPreference";
import { getDataRoot } from "./dataRoot";
import { detectLinuxLaunchTools } from "./linuxLaunchTools";

interface HeldPreference {
  previous: string | null;
  value: string;
  holders: number;
}

type RecoveryRecord = Record<
  string,
  { previous: string | null; value: string }
>;

const held = new Map<string, HeldPreference>();
let recovered: Promise<void> | null = null;

function runReg(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      args,
      { windowsHide: true, timeout: 10000 },
      (error, stdout) => resolve({ ok: !error, stdout: String(stdout ?? "") }),
    );
  });
}

async function readValue(name: string): Promise<string | null> {
  const result = await runReg([
    "query",
    WINDOWS_GPU_PREFERENCES_KEY,
    "/v",
    name,
  ]);
  return result.ok ? parseRegQueryValue(result.stdout, name) : null;
}

async function writeValue(name: string, value: string): Promise<boolean> {
  const result = await runReg([
    "add",
    WINDOWS_GPU_PREFERENCES_KEY,
    "/v",
    name,
    "/t",
    "REG_SZ",
    "/d",
    value,
    "/f",
  ]);
  return result.ok;
}

async function restoreValue(name: string, previous: string | null) {
  if (previous === null) {
    await runReg(["delete", WINDOWS_GPU_PREFERENCES_KEY, "/v", name, "/f"]);
    return;
  }
  await writeValue(name, previous);
}

function recoveryFile(): string {
  return path.join(getDataRoot(), "gpu-preference-restore.json");
}

async function saveRecovery() {
  const record: RecoveryRecord = {};
  for (const [name, entry] of held) {
    record[name] = { previous: entry.previous, value: entry.value };
  }
  try {
    if (Object.keys(record).length === 0) await fs.remove(recoveryFile());
    else await fs.outputJson(recoveryFile(), record);
  } catch (error) {
    console.warn("[gpu] could not save the restore record:", error);
  }
}

async function recoverLeftovers() {
  const record = (await fs
    .readJson(recoveryFile())
    .catch(() => null)) as RecoveryRecord | null;
  if (!record || typeof record !== "object") return;

  for (const [name, entry] of Object.entries(record)) {
    if (!entry || typeof entry.value !== "string") continue;
    if ((await readValue(name)) !== entry.value) continue;
    await restoreValue(
      name,
      typeof entry.previous === "string" ? entry.previous : null,
    );
  }
  await fs.remove(recoveryFile()).catch(() => {});
}

async function holdWindowsPreference(
  javaPath: string,
  preference: GpuPreference,
): Promise<(() => Promise<void>) | null> {
  recovered ??= recoverLeftovers().catch(() => {});
  await recovered;

  const code = windowsGpuPreferenceCode(preference);
  if (code === null) return null;

  const name = path.resolve(javaPath);
  const current = held.get(name);

  if (current) {
    const value = mergeWindowsGpuValue(current.previous, code);
    if (current.value !== value && (await writeValue(name, value))) {
      current.value = value;
    }
    current.holders += 1;
  } else {
    const previous = await readValue(name);
    const value = mergeWindowsGpuValue(previous, code);
    if (previous === value) return null;
    if (!(await writeValue(name, value))) return null;
    held.set(name, { previous, value, holders: 1 });
  }
  await saveRecovery();

  let released = false;
  return async () => {
    if (released) return;
    released = true;

    const entry = held.get(name);
    if (!entry) return;
    entry.holders -= 1;
    if (entry.holders > 0) return;

    held.delete(name);
    await restoreValue(name, entry.previous);
    await saveRecovery();
  };
}

export interface PreparedGpuPreference {
  env: Record<string, string>;
  release: (() => Promise<void>) | null;
}

export async function prepareGpuPreference(
  javaPath: string,
  preference: GpuPreference,
): Promise<PreparedGpuPreference> {
  if (process.platform === "win32") {
    const release = await holdWindowsPreference(javaPath, preference).catch(
      (error) => {
        console.warn("[gpu] could not set the GPU preference:", error);
        return null;
      },
    );
    return { env: {}, release };
  }

  if (process.platform === "linux" && preference !== "auto") {
    const tools = await detectLinuxLaunchTools();
    return {
      env: linuxGpuEnvironment(preference, { nvidia: tools.nvidia }),
      release: null,
    };
  }

  return { env: {}, release: null };
}
