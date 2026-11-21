import { app } from "electron";
import fs from "fs";
import path from "path";

export const PORTABLE_DIR_NAME = "data";

export interface PortablePaths {
  appData: string;
  userData: string;
  logs: string;
  crashDumps: string;
  temp: string;
}

let portableRoot: string | null = null;

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function findPortableRoot(
  execPath: string,
  exists: (target: string) => boolean = isDirectory,
): string | null {
  const candidate = path.win32.join(
    path.win32.dirname(execPath),
    PORTABLE_DIR_NAME,
  );
  return exists(candidate) ? candidate : null;
}

export function portablePaths(
  root: string,
  userDataName: string,
): PortablePaths {
  const userData = path.win32.join(root, userDataName);
  return {
    appData: root,
    userData,
    logs: path.win32.join(userData, "logs"),
    crashDumps: path.win32.join(userData, "Crashpad"),
    temp: path.win32.join(root, "Temp"),
  };
}

export function enablePortableMode(): string | null {
  if (process.platform !== "win32" || !app.isPackaged) return null;

  const root = findPortableRoot(process.execPath);
  if (!root) return null;

  const paths = portablePaths(root, path.basename(app.getPath("userData")));
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.mkdirSync(paths.temp, { recursive: true });

  app.setPath("appData", paths.appData);
  app.setPath("userData", paths.userData);
  app.setPath("sessionData", paths.userData);
  app.setPath("crashDumps", paths.crashDumps);
  app.setPath("temp", paths.temp);
  app.setAppLogsPath(paths.logs);
  process.env.TEMP = paths.temp;
  process.env.TMP = paths.temp;

  portableRoot = root;
  return root;
}

export function isPortable(): boolean {
  return portableRoot !== null;
}

export function getPortableRoot(): string | null {
  return portableRoot;
}
