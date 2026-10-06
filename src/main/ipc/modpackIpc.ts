import type { IVersionConf } from "@/types/IVersion";
import type { IModpackExtraFile } from "@/types/ModManager";
import type {
  ModpackApplyResult,
  ModpackBase,
  ModpackBaseInput,
  ModpackFilesPlan,
  ModpackRollback,
  ModpackRollbackInfo,
} from "@/types/ModpackSource";
import {
  applyModpackUpdateFiles,
  dropModpackRollback,
  planModpackUpdateFiles,
  readModpackBase,
  readModpackRollback,
  restoreModpackRollback,
  writeModpackBase,
} from "../game/modpackSource";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath, assertWritablePath } from "../utilities/safePath";
import { isVersionRunning } from "../utilities/worldBackups";

const MODPACK_UPDATE_RUNNING = "MODPACK_UPDATE_RUNNING";

const isPath = check.nonEmptyString(4096);
const isConf = check.object();
const isExtraFiles = check.arrayOf(check.object(), 20000);
const isPlan = check.object();
const isVersionNumber = check.string(512);

function asExtraFiles(value: unknown): IModpackExtraFile[] {
  return Array.isArray(value) ? (value as IModpackExtraFile[]) : [];
}

export function registerModpackIpc() {
  handleSafe<boolean, [string, string, ModpackBaseInput]>(
    "modpack:writeBase",
    false,
    [isPath, isPath, check.object()],
    async (_, versionPath, root, input) => {
      assertWritablePath(versionPath, "modpack:writeBase");
      assertReadablePath(root, "modpack:writeBase");
      await writeModpackBase(versionPath, root, {
        versionId: String(input.versionId ?? ""),
        loaderVersion:
          typeof input.loaderVersion === "string"
            ? input.loaderVersion
            : undefined,
        projects: Array.isArray(input.projects) ? input.projects : [],
        extraFiles: asExtraFiles(input.extraFiles),
      });
      return true;
    },
  );

  handleSafe<ModpackBase | null, [string]>(
    "modpack:readBase",
    null,
    [isPath],
    async (_, versionPath) => {
      assertReadablePath(versionPath, "modpack:readBase");
      return await readModpackBase(versionPath);
    },
  );

  handleSafe<ModpackFilesPlan | null, [string, string, IModpackExtraFile[]]>(
    "modpack:planFiles",
    null,
    [isPath, isPath, isExtraFiles],
    async (_, versionPath, root, extraFiles) => {
      assertReadablePath(versionPath, "modpack:planFiles");
      assertReadablePath(root, "modpack:planFiles");
      return await planModpackUpdateFiles(
        versionPath,
        root,
        asExtraFiles(extraFiles),
      );
    },
  );

  handleSafe<
    ModpackApplyResult | null,
    [
      string,
      string,
      IModpackExtraFile[],
      ModpackFilesPlan,
      IVersionConf,
      string,
      string[],
    ]
  >(
    "modpack:applyFiles",
    null,
    [
      isPath,
      isPath,
      isExtraFiles,
      isPlan,
      isConf,
      isVersionNumber,
      check.optional(check.arrayOf(check.string(4096), 20000)),
    ],
    async (
      _,
      versionPath,
      root,
      extraFiles,
      plan,
      previousConf,
      toVersion,
      preserve,
    ) => {
      assertWritablePath(versionPath, "modpack:applyFiles");
      assertReadablePath(root, "modpack:applyFiles");
      if (isVersionRunning(versionPath)) {
        throw new Error(MODPACK_UPDATE_RUNNING);
      }

      return await applyModpackUpdateFiles({
        versionPath,
        root,
        extraFiles: asExtraFiles(extraFiles),
        plan: {
          write: Array.isArray(plan.write) ? plan.write : [],
          remove: Array.isArray(plan.remove) ? plan.remove : [],
        },
        preserve: Array.isArray(preserve)
          ? preserve.filter((item): item is string => typeof item === "string")
          : [],
        previousConf,
        toVersion,
      });
    },
  );

  handleSafe<ModpackRollbackInfo | null, [string]>(
    "modpack:rollbackInfo",
    null,
    [isPath],
    async (_, versionPath) => {
      assertReadablePath(versionPath, "modpack:rollbackInfo");
      return await readModpackRollback(versionPath);
    },
  );

  handleSafe<ModpackRollback | null, [string]>(
    "modpack:restoreRollback",
    null,
    [isPath],
    async (_, versionPath) => {
      assertWritablePath(versionPath, "modpack:restoreRollback");
      if (isVersionRunning(versionPath)) {
        throw new Error(MODPACK_UPDATE_RUNNING);
      }
      return await restoreModpackRollback(versionPath);
    },
  );

  handleSafe<boolean, [string]>(
    "modpack:dropRollback",
    false,
    [isPath],
    async (_, versionPath) => {
      assertWritablePath(versionPath, "modpack:dropRollback");
      await dropModpackRollback(versionPath);
      return true;
    },
  );
}
