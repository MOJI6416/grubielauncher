import path from "path";
import fs from "fs-extra";
import { IVersionConf } from "@/types/IVersion";
import { ILoader } from "@/types/Loader";
import { TSettings } from "@/types/Settings";
import { ILocalAccount } from "@/types/Account";
import { LOADER_CHANGE_UNVERIFIED } from "@/types/InstallationProgress";
import {
  LOADER_VERSION_ID_PATTERN,
  isModdedLoader,
  manifestMentionsLoaderVersion,
} from "@/shared/loaderCompat";
import { writeJsonAtomic } from "../utilities/atomicJson";
import { assertSafeFileSegment } from "./serverScriptSafety";
import { Version } from "./Version";

export type LoaderBuild = NonNullable<ILoader["version"]>;

const STORAGE_FOLDER = "storage";
const STAGING_FOLDER = "loader-staging";
const ROLLBACK_FOLDER = "loader-rollback";
const SNAPSHOT_FILE = "snapshot.json";

interface LoaderSnapshot {
  loader: string;
  minecraft: string;
  version: LoaderBuild;
  createdAt: number;
}

export function getLoaderStatePaths(versionPath: string) {
  const storagePath = path.join(versionPath, STORAGE_FOLDER);

  return {
    stagingPath: path.join(storagePath, STAGING_FOLDER),
    rollbackPath: path.join(storagePath, ROLLBACK_FOLDER),
    nextRollbackPath: path.join(storagePath, `${ROLLBACK_FOLDER}.next`),
  };
}

export function getLoaderStateFiles(conf: IVersionConf): string[] {
  return [
    `${conf.version.id}.json`,
    `${conf.loader.name}.json`,
    `${conf.loader.name}.jar`,
  ];
}

function isLoaderBuild(value: unknown): value is LoaderBuild {
  const build = value as Partial<LoaderBuild> | null;

  return (
    !!build &&
    typeof build.id === "string" &&
    LOADER_VERSION_ID_PATTERN.test(build.id) &&
    typeof build.url === "string" &&
    build.url.length > 0
  );
}

export async function readLoaderRollback(
  versionPath: string,
  conf: IVersionConf,
): Promise<LoaderBuild | null> {
  if (!isModdedLoader(conf.loader?.name)) return null;

  const { rollbackPath } = getLoaderStatePaths(versionPath);
  const snapshot: LoaderSnapshot | null = await fs
    .readJSON(path.join(rollbackPath, SNAPSHOT_FILE))
    .catch(() => null);

  if (
    !snapshot ||
    snapshot.loader !== conf.loader.name ||
    snapshot.minecraft !== conf.version.id ||
    !isLoaderBuild(snapshot.version)
  ) {
    return null;
  }

  if (!(await fs.pathExists(path.join(rollbackPath, `${conf.version.id}.json`)))) {
    return null;
  }

  return { id: snapshot.version.id, url: snapshot.version.url };
}

async function seedStaging(
  versionPath: string,
  stagingPath: string,
  conf: IVersionConf,
  rollbackPath: string | null,
) {
  await fs.remove(stagingPath);
  await fs.ensureDir(stagingPath);

  for (const entry of [`${conf.version.id}.jar`, "natives"]) {
    const source = path.join(versionPath, entry);
    if (await fs.pathExists(source)) {
      await fs.copy(source, path.join(stagingPath, entry));
    }
  }

  if (!rollbackPath) return;

  for (const file of getLoaderStateFiles(conf)) {
    const source = path.join(rollbackPath, file);
    if (await fs.pathExists(source)) {
      await fs.copy(source, path.join(stagingPath, file));
    }
  }
}

async function assertStagedLoader(
  stagingPath: string,
  conf: IVersionConf,
  build: LoaderBuild,
) {
  const manifest = await fs
    .readJSON(path.join(stagingPath, `${conf.version.id}.json`))
    .catch(() => null);

  if (!manifest?.mainClass || !manifestMentionsLoaderVersion(manifest, build.id)) {
    throw new Error(LOADER_CHANGE_UNVERIFIED);
  }
}

async function commitStagedLoader(
  versionPath: string,
  previous: IVersionConf,
  next: IVersionConf,
) {
  const { stagingPath, rollbackPath, nextRollbackPath } =
    getLoaderStatePaths(versionPath);
  const files = getLoaderStateFiles(previous);

  await fs.remove(nextRollbackPath);
  await fs.ensureDir(nextRollbackPath);

  if (previous.loader.version) {
    const snapshot: LoaderSnapshot = {
      loader: previous.loader.name,
      minecraft: previous.version.id,
      version: previous.loader.version,
      createdAt: Date.now(),
    };
    await writeJsonAtomic(path.join(nextRollbackPath, SNAPSHOT_FILE), snapshot);
  }

  const parked: string[] = [];
  const placed: string[] = [];

  try {
    for (const file of files) {
      const live = path.join(versionPath, file);
      if (!(await fs.pathExists(live))) continue;

      await fs.move(live, path.join(nextRollbackPath, file), { overwrite: true });
      parked.push(file);
    }

    for (const file of files) {
      const staged = path.join(stagingPath, file);
      if (!(await fs.pathExists(staged))) continue;

      await fs.move(staged, path.join(versionPath, file), { overwrite: true });
      placed.push(file);
    }

    await writeJsonAtomic(path.join(versionPath, "version.json"), next);
  } catch (error) {
    for (const file of placed) {
      await fs.remove(path.join(versionPath, file)).catch(() => {});
    }
    for (const file of parked) {
      await fs
        .move(path.join(nextRollbackPath, file), path.join(versionPath, file), {
          overwrite: true,
        })
        .catch(() => {});
    }
    await fs.remove(nextRollbackPath).catch(() => {});
    throw error;
  }

  await fs.remove(rollbackPath).catch(() => {});
  await fs
    .move(nextRollbackPath, rollbackPath, { overwrite: true })
    .catch(() => {});
}

export async function changeLoaderVersion({
  versionPath,
  conf,
  build,
  settings,
  account,
  signal,
  onStaged,
}: {
  versionPath: string;
  conf: IVersionConf;
  build: LoaderBuild;
  settings: TSettings;
  account: ILocalAccount;
  signal: AbortSignal;
  onStaged?: (version: Version) => void;
}): Promise<IVersionConf> {
  if (!isModdedLoader(conf.loader?.name)) {
    throw new Error("The instance has no mod loader to change");
  }
  assertSafeFileSegment(build.id, "loader version id");

  const { stagingPath, rollbackPath } = getLoaderStatePaths(versionPath);
  const rollback = await readLoaderRollback(versionPath, conf);
  const next: IVersionConf = {
    ...conf,
    loader: { ...conf.loader, version: { id: build.id, url: build.url } },
  };

  try {
    await seedStaging(
      versionPath,
      stagingPath,
      conf,
      rollback?.id === build.id ? rollbackPath : null,
    );

    const staged = new Version(next, { versionPath: stagingPath });
    onStaged?.(staged);

    await staged.init();
    await staged.install(settings, account, [], { operation: "loader", signal });
    await assertStagedLoader(stagingPath, next, build);
    await commitStagedLoader(versionPath, conf, next);

    return next;
  } finally {
    await fs.remove(stagingPath).catch(() => {});
  }
}
