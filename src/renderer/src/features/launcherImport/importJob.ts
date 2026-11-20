import { atom, getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import type { ForeignInstanceSummary, ForeignImportPlan, ImportPart } from "@/types/LauncherImport";
import type { InstanceSettingsOverrides } from "@/shared/instanceSettings";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { ProjectType, Provider } from "@/types/ModManager";
import {
  accountAtom,
  networkAtom,
  pathsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { createInstance } from "@renderer/features/newInstance/createInstance";
import { resolvePackVersions } from "@renderer/features/newInstance/resolvePackVersions";
import { suggestInstanceName } from "@renderer/features/newInstance/nameValidation";
import { instanceKey } from "@renderer/features/instances/selectors";
import { loaderRequiresBackend } from "@renderer/utilities/connectivity";
import { describeNotEnoughSpace, isNotEnoughSpace } from "@renderer/utilities/diskRoom";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { readLauncherState, writeLauncherState } from "@renderer/utilities/launcherState";
import { ImportStepError, describeImportFailure } from "./failures";
import {
  skippedJarKeys,
  withoutSkipped,
} from "@renderer/features/newInstance/unknownJars";
import {
  importUnknownJars,
  skippedFileNames,
  type ImportUnknownJar,
} from "./unknownJarReview";

const api = window.api;

export type ImportItemStatus =
  | "queued"
  | "preparing"
  | "reviewing"
  | "copying"
  | "installing"
  | "done"
  | "failed"
  | "cancelled";

export interface ImportItemState {
  id: string;
  name: string;
  status: ImportItemStatus;
  percent?: number;
  error?: string;
  instanceKey?: string;
  identified?: number;
  modCount?: number;
  copyFailed?: number;
  loaderFallback?: string;
  unknownJars?: ImportUnknownJar[];
}

export interface ImportJob {
  running: boolean;
  items: ImportItemState[];
}

export const launcherImportJobAtom = atom<ImportJob | null>(null);
export const importedLaunchersAtom = atom<ReadonlySet<string>>(new Set<string>());

let controller: AbortController | null = null;
const reviews = new Map<string, (install: ReadonlySet<string> | null) => void>();

export function answerUnknownJars(
  id: string,
  install: ReadonlySet<string> | null,
): void {
  reviews.get(id)?.(install);
}

function waitForReview(
  id: string,
  signal: AbortSignal,
): Promise<ReadonlySet<string> | null> {
  return new Promise((resolve) => {
    const finish = (install: ReadonlySet<string> | null) => {
      reviews.delete(id);
      resolve(install);
    };
    if (signal.aborted) return finish(null);
    reviews.set(id, finish);
    signal.addEventListener("abort", () => finish(null), { once: true });
  });
}

function patchItem(id: string, patch: Partial<ImportItemState>): void {
  const store = getDefaultStore();
  const job = store.get(launcherImportJobAtom);
  if (!job) return;
  store.set(launcherImportJobAtom, {
    ...job,
    items: job.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
}

export async function loadImportedLaunchers(launcherPath: string): Promise<void> {
  const state = await readLauncherState(launcherPath);
  getDefaultStore().set(importedLaunchersAtom, new Set(state?.launcherImported ?? []));
}

async function rememberImported(id: string): Promise<void> {
  const store = getDefaultStore();
  const launcherPath = store.get(pathsAtom).launcher;
  store.set(importedLaunchersAtom, new Set([...store.get(importedLaunchersAtom), id]));
  if (!launcherPath) return;
  const state = await readLauncherState(launcherPath);
  const imported = new Set(state?.launcherImported ?? []);
  imported.add(id);
  await writeLauncherState(launcherPath, {
    ...(state || {}),
    launcherImported: [...imported].slice(-500),
  });
}

async function takenNames(): Promise<string[]> {
  const store = getDefaultStore();
  const names = store.get(versionsAtom).map((version) => version.version.name);
  const minecraft = store.get(pathsAtom).minecraft;
  if (!minecraft) return names;
  const folders = await api.fs
    .getDirectories(await api.path.join(minecraft, "versions"))
    .catch(ignoreFailure);
  return [...names, ...(Array.isArray(folders) ? folders : [])];
}

function overridesOf(plan: ForeignImportPlan): InstanceSettingsOverrides | undefined {
  const overrides: InstanceSettingsOverrides = {};
  if (plan.memoryMb) overrides.xmx = plan.memoryMb;
  if (!plan.keepOptimizedJvm) overrides.optimizedJvm = false;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

async function importOne(
  summary: ForeignInstanceSummary,
  parts: ImportPart[],
  signal: AbortSignal,
): Promise<void> {
  const t = i18n.t.bind(i18n);
  patchItem(summary.id, { status: "preparing" });

  const plan = await api.launcherImport.plan(summary.id, parts);
  if (!plan) throw new ImportStepError(t("launcherImport.errors.gone"));

  const staging = plan.modpack.folderPath;
  try {
    if (signal.aborted) throw new Error(VERSION_INSTALL_CANCELLED);

    const pack = plan.modpack;
    const loader = pack.loader ?? "vanilla";
    const resolution = await resolvePackVersions(pack);
    if (!resolution.minecraftVersion) {
      throw new ImportStepError(
        resolution.versionMissing
          ? t("launcherImport.errors.version", { version: pack.version })
          : t("launcherImport.errors.catalog"),
      );
    }

    const fallback =
      loader !== "vanilla" && !resolution.loaderVersion
        ? resolution.loaderVersions[0]
        : undefined;
    const loaderVersion = resolution.loaderVersion ?? fallback;
    if (loader !== "vanilla" && !loaderVersion) {
      throw new ImportStepError(t("launcherImport.errors.loader"));
    }
    if (loaderRequiresBackend(loader) && !getDefaultStore().get(networkAtom)) {
      throw new ImportStepError(t("launcherImport.errors.backend"));
    }

    const unknownJars = importUnknownJars(pack.mods, plan.catalogChecked !== false);
    let skipped = new Set<string>();
    if (unknownJars.length > 0) {
      patchItem(summary.id, { status: "reviewing", unknownJars });
      const install = await waitForReview(summary.id, signal);
      if (!install) throw new Error(VERSION_INSTALL_CANCELLED);
      skipped = skippedJarKeys(unknownJars, install);
      patchItem(summary.id, { status: "preparing", unknownJars: undefined });
    }
    const kept = withoutSkipped(pack.mods, skipped);

    const mods = pack.mods.filter((mod) => mod.projectType === ProjectType.MOD);
    patchItem(summary.id, {
      status: plan.bytes > 0 ? "copying" : "installing",
      identified: mods.filter((mod) => mod.provider !== Provider.LOCAL).length,
      modCount: mods.length,
      ...(fallback ? { loaderFallback: fallback.id } : {}),
    });

    const name = suggestInstanceName(pack.name, await takenNames()) || summary.minecraftVersion;
    const { instance, copyFailed } = await createInstance({
      name,
      image: pack.image ?? "",
      loader,
      loaderVersion,
      minecraftVersion: resolution.minecraftVersion,
      mods: kept,
      servers: [],
      options: "",
      runArguments: { jvm: plan.jvmArguments, game: "" },
      quickServer: "",
      pack: {
        kind: "file",
        title: pack.name,
        isOwner: true,
        importModpack: skipped.size > 0 ? { ...pack, mods: kept } : pack,
        foreign: {
          id: plan.id,
          parts,
          sourceRoot: plan.sourceRoot,
          bytes: plan.bytes,
        },
      },
      blockedMods: [],
      overrides: overridesOf(plan),
      signal,
    });

    for (const name of skippedFileNames(unknownJars, skipped)) {
      const target = await api.path.join(instance.versionPath, "mods", name);
      if (await api.fs.pathExists(target))
        await api.fs.rimraf(target).catch(ignoreFailure);
    }

    patchItem(summary.id, {
      status: "done",
      instanceKey: instanceKey(instance),
      copyFailed,
    });
    await rememberImported(summary.id).catch(ignoreFailure);
  } finally {
    await api.fs.rimraf(staging).catch(ignoreFailure);
  }
}

function failureText(error: unknown): string {
  if (isNotEnoughSpace(error)) return describeNotEnoughSpace(error.room);
  return describeImportFailure(error);
}

export function isLauncherImportRunning(): boolean {
  return getDefaultStore().get(launcherImportJobAtom)?.running === true;
}

export function stopLauncherImport(): void {
  controller?.abort();
}

export function clearLauncherImportJob(): void {
  if (isLauncherImportRunning()) return;
  getDefaultStore().set(launcherImportJobAtom, null);
}

export async function startLauncherImport(
  instances: ForeignInstanceSummary[],
  parts: ImportPart[],
): Promise<void> {
  const store = getDefaultStore();
  if (isLauncherImportRunning() || instances.length === 0) return;
  if (!store.get(accountAtom)) return;

  controller = new AbortController();
  const signal = controller.signal;
  store.set(launcherImportJobAtom, {
    running: true,
    items: instances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      status: "queued" as const,
    })),
  });

  const unsubscribe = api.launcherImport.onCopyProgress((progress) => {
    const job = store.get(launcherImportJobAtom);
    const item = job?.items.find((entry) => entry.id === progress.id);
    if (!item || item.status !== "copying") return;
    const finished =
      progress.totalBytes > 0 && progress.processedBytes >= progress.totalBytes;
    patchItem(progress.id, {
      status: finished ? "installing" : "copying",
      percent:
        progress.totalBytes > 0
          ? Math.min(100, Math.round((progress.processedBytes / progress.totalBytes) * 100))
          : undefined,
    });
  });

  try {
    for (const instance of instances) {
      if (signal.aborted) {
        patchItem(instance.id, { status: "cancelled" });
        continue;
      }
      try {
        await importOne(instance, parts, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        patchItem(
          instance.id,
          message === VERSION_INSTALL_CANCELLED || signal.aborted
            ? { status: "cancelled" }
            : { status: "failed", error: failureText(error) },
        );
      }
    }
  } finally {
    unsubscribe();
    controller = null;
    const job = store.get(launcherImportJobAtom);
    if (job) store.set(launcherImportJobAtom, { ...job, running: false });
    announce(store.get(launcherImportJobAtom));
  }
}

function announce(job: ImportJob | null): void {
  if (!job) return;
  const t = i18n.t.bind(i18n);
  const done = job.items.filter((item) => item.status === "done").length;
  const failed = job.items.filter((item) => item.status === "failed").length;
  if (failed > 0) {
    toast.warning(t("launcherImport.result.partial", { count: done, failed }));
  } else if (done > 0) {
    toast.success(t("launcherImport.result.done", { count: done }));
  }
}
