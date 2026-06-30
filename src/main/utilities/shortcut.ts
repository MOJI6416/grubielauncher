import { app, nativeImage, shell } from "electron";
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { getLauncherPaths } from "./other";
import { isSafeRemoteImageUrl } from "./safeUrl";

export interface ShortcutResult {
  success: boolean;
  error?: string;
}

function buildLaunchDeepLink(versionName: string, instance: number): string {
  return `grubielauncher://launch/${encodeURIComponent(
    versionName,
  )}?instance=${instance}`;
}

function sanitizeShortcutName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "instance";
}

async function resolveImageBuffer(source: string): Promise<Buffer | null> {
  try {
    if (source.startsWith("data:")) {
      const comma = source.indexOf(",");
      if (comma === -1) return null;
      return Buffer.from(source.slice(comma + 1), "base64");
    }
    if (source.startsWith("http://") || source.startsWith("https://")) {
      if (!isSafeRemoteImageUrl(source)) return null;
      const res = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      return Buffer.from(res.data);
    }
    const filePath = source.startsWith("file://")
      ? fileURLToPath(source)
      : source;
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function getImageBase64(source: string): Promise<string | null> {
  const buffer = await resolveImageBuffer(source);
  return buffer ? buffer.toString("base64") : null;
}

function imageToPng256(buffer: Buffer): Buffer | null {
  let img = nativeImage.createFromBuffer(buffer);
  if (img.isEmpty()) return null;
  img = img.resize({ width: 256, height: 256, quality: "best" });
  const png = img.toPNG();
  return png.length > 0 ? png : null;
}

function pngToIco(png: Buffer): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, png]);
}

async function buildShortcutIcon(
  imageSource: string | undefined,
  fileBase: string,
): Promise<string | null> {
  if (!imageSource) return null;
  try {
    const buffer = await resolveImageBuffer(imageSource);
    if (!buffer) return null;
    const png = imageToPng256(buffer);
    if (!png) return null;

    const { shortcuts: iconsDir } = await getLauncherPaths();
    await fs.ensureDir(iconsDir);

    if (process.platform === "win32") {
      const icoPath = path.join(iconsDir, `${fileBase}.ico`);
      await fs.writeFile(icoPath, pngToIco(png));
      return icoPath;
    }

    const pngPath = path.join(iconsDir, `${fileBase}.png`);
    await fs.writeFile(pngPath, png);
    return pngPath;
  } catch {
    return null;
  }
}

export async function createInstanceShortcut(
  versionName: string,
  instance: number,
  imageSource?: string,
): Promise<ShortcutResult> {
  const deepLink = buildLaunchDeepLink(versionName, instance);
  const desktop = app.getPath("desktop");
  const fileBase = sanitizeShortcutName(versionName);
  const iconPath = await buildShortcutIcon(imageSource, fileBase);

  if (process.platform === "win32") {
    const shortcutPath = path.join(desktop, `${fileBase}.lnk`);
    const ok = shell.writeShortcutLink(shortcutPath, "create", {
      target: process.execPath,
      args: deepLink,
      description: `GrubieLauncher — ${versionName}`,
      ...(iconPath ? { icon: iconPath, iconIndex: 0 } : {}),
    });
    return ok
      ? { success: true }
      : { success: false, error: "writeShortcutLink failed" };
  }

  if (process.platform === "linux") {
    const shortcutPath = path.join(desktop, `${fileBase}.desktop`);
    const lines = [
      "[Desktop Entry]",
      "Type=Application",
      `Name=${versionName}`,
      "Comment=GrubieLauncher",
      `Exec="${process.execPath}" "${deepLink}"`,
      "Terminal=false",
    ];
    if (iconPath) lines.push(`Icon=${iconPath}`);
    await fs.writeFile(shortcutPath, lines.join("\n") + "\n", { mode: 0o755 });
    return { success: true };
  }

  return { success: false, error: "unsupported platform" };
}
