import { IConsole } from "@/types/Console";

export interface LaunchBlockContext {
  installActive: boolean;
  hasVersion: boolean;
  hasAccount: boolean;
  hasSettings: boolean;
  hasPaths: boolean;
  isInstalled?: boolean;
}

export type LaunchBlock =
  | { kind: "busy"; messageKey: string }
  | { kind: "error"; titleKey: string; hintKey: string };

export function resolveLaunchBlock(
  context: LaunchBlockContext,
): LaunchBlock | null {
  if (context.installActive) {
    return { kind: "busy", messageKey: "versions.installBusy" };
  }

  if (!context.hasVersion) {
    return {
      kind: "error",
      titleKey: "app.startupNoVersion",
      hintKey: "app.startupNoVersionHint",
    };
  }

  if (!context.hasAccount) {
    return {
      kind: "error",
      titleKey: "app.startupNoAccount",
      hintKey: "app.startupNoAccountHint",
    };
  }

  if (!context.hasSettings || !context.hasPaths) {
    return {
      kind: "error",
      titleKey: "app.startupNoPaths",
      hintKey: "app.startupNoPathsHint",
    };
  }

  if (context.isInstalled === false) {
    return {
      kind: "error",
      titleKey: "versions.state.notInstalled",
      hintKey: "versions.repairHint",
    };
  }

  return null;
}

export function nextInstanceNumber(
  consoles: Pick<IConsole, "versionName" | "status" | "instance">[],
  versionName: string,
): number {
  const highest = consoles
    .filter(
      (entry) => entry.versionName === versionName && entry.status === "running",
    )
    .reduce((max, entry) => Math.max(max, entry.instance), -1);

  return highest >= 0 ? highest + 1 : 0;
}

export function isInstanceRunning(
  consoles: Pick<IConsole, "versionName" | "status">[],
  versionName: string,
): boolean {
  return consoles.some(
    (entry) => entry.versionName === versionName && entry.status === "running",
  );
}
