import { app } from "electron";
import path from "path";
import fs from "fs-extra";
import { normalizeSettings } from "@/types/Settings";
import { getDataRoot } from "./dataRoot";
import { CATALOG_PROTOCOLS } from "./deepLink";

function clientArgs(): [string, string[]] | null {
  if (!process.defaultApp) return null;
  const appPath = process.argv.slice(1).find((arg) => !arg.startsWith("-"));
  return appPath ? [process.execPath, [path.resolve(appPath)]] : null;
}

function register(scheme: string): boolean {
  const args = clientArgs();
  if (process.defaultApp && !args) return false;
  return args
    ? app.setAsDefaultProtocolClient(scheme, args[0], args[1])
    : app.setAsDefaultProtocolClient(scheme);
}

function isRegistered(scheme: string): boolean {
  const args = clientArgs();
  return args
    ? app.isDefaultProtocolClient(scheme, args[0], args[1])
    : app.isDefaultProtocolClient(scheme);
}

function unregister(scheme: string): boolean {
  if (!isRegistered(scheme)) return true;
  const args = clientArgs();
  return args
    ? app.removeAsDefaultProtocolClient(scheme, args[0], args[1])
    : app.removeAsDefaultProtocolClient(scheme);
}

export function applyCatalogProtocols(enabled: boolean): boolean {
  return CATALOG_PROTOCOLS.map((scheme) =>
    enabled ? register(scheme) : unregister(scheme),
  ).every(Boolean);
}

export async function restoreCatalogProtocols(): Promise<void> {
  const raw = await fs
    .readJSON(path.join(getDataRoot(), "settings.json"))
    .catch(() => null);
  applyCatalogProtocols(normalizeSettings(raw).catalogLinks);
}
