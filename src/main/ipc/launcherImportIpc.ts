import path from "path";
import { app } from "electron";
import { randomUUID } from "crypto";
import {
  IMPORT_PARTS,
  type ForeignCopyProgress,
  type ForeignImportPlan,
  type ImportPart,
  type LauncherScanResult,
} from "@/types/LauncherImport";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath, assertWritablePath } from "../utilities/safePath";
import { getDataRoot } from "../utilities/dataRoot";
import { getLauncherPaths } from "../utilities/other";
import { sendProgress, throttleProgress } from "../utilities/progressEvents";
import { systemEnv } from "../launcherImport/locate";
import { foreignInstanceById, scanLaunchers, scanWithFolder } from "../launcherImport/scan";
import { planImport } from "../launcherImport/plan";
import { collectCopyItems, copyItems, type CopyResult } from "../launcherImport/content";

const EMPTY_SCAN: LauncherScanResult = { instances: [], roots: [] };
const IMPORT_ID = /^[0-9a-f]{20}$/;
const isId = check.pattern(IMPORT_ID, 20);
const isParts = check.arrayOf(check.oneOf(...IMPORT_PARTS), IMPORT_PARTS.length);

function isInside(child: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function registerLauncherImportIpc() {
  handleSafe<LauncherScanResult>("launcherImport:scan", EMPTY_SCAN, () =>
    scanLaunchers(systemEnv(), getDataRoot()),
  );

  handleSafe<{ result: LauncherScanResult; added: number }, [string]>(
    "launcherImport:scanFolder",
    { result: EMPTY_SCAN, added: 0 },
    [check.nonEmptyString(4096)],
    (_, folder) => {
      assertReadablePath(folder, "launcherImport:scanFolder");
      return scanWithFolder(folder, systemEnv(), getDataRoot());
    },
  );

  handleSafe<ForeignImportPlan | null, [string, ImportPart[]]>(
    "launcherImport:plan",
    null,
    [isId, isParts],
    async (_, id, parts) => {
      const instance = foreignInstanceById(id);
      if (!instance) return null;
      const staging = path.join(
        app.getPath("temp"),
        "grubie-launcher-import",
        `${id}-${randomUUID().slice(0, 8)}`,
      );
      return planImport(id, instance, new Set(parts), staging);
    },
  );

  handleSafe<CopyResult | null, [string, string, ImportPart[]]>(
    "launcherImport:copy",
    null,
    [isId, check.nonEmptyString(4096), isParts],
    async (event, id, versionPath, parts) => {
      assertWritablePath(versionPath, "launcherImport:copy");
      const versionsRoot = path.join(getLauncherPaths().minecraft, "versions");
      if (!isInside(versionPath, versionsRoot)) return null;

      const instance = foreignInstanceById(id);
      if (!instance) return null;

      const items = await collectCopyItems(instance, new Set(parts));
      const report = throttleProgress((progress: ForeignCopyProgress) =>
        sendProgress(event.sender, "launcherImport:copyProgress", progress),
      );
      return copyItems(items, versionPath, (processedBytes, totalBytes) =>
        report({ id, processedBytes, totalBytes }),
      );
    },
  );
}
