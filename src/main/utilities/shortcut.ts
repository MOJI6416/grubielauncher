import { app, nativeImage, shell } from "electron";
import fs from "fs-extra";
import path from "path";
import { createHash } from "crypto";
import axios from "axios";
import { fileURLToPath } from "url";
import { getLauncherPaths } from "./other";
import { isSafeRemoteFetchUrl } from "./safeUrl";
import { isReadablePath } from "./safePath";
import { isInsidePath } from "./dataRoot";
import { assertSafeVersionName } from "@/shared/versionName";

const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAC_SHORTCUT_ID_PREFIX = "com.grubielauncher.shortcut.";
const MAC_LAUNCHER_ID = "com.grubielauncher.app";

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
  return toDesktopEntryValue(name).replace(/[\\/:*?"<>|]/g, "_") || "instance";
}

function toDesktopEntryValue(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    result += char;
  }
  return result.trim();
}

async function resolveImageBuffer(source: string): Promise<Buffer | null> {
  try {
    if (source.startsWith("data:")) {
      const comma = source.indexOf(",");
      if (comma === -1) return null;
      return Buffer.from(source.slice(comma + 1), "base64");
    }
    if (source.startsWith("http://") || source.startsWith("https://")) {
      if (!(await isSafeRemoteFetchUrl(source))) return null;
      const res = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 10000,
        maxContentLength: MAX_REMOTE_IMAGE_BYTES,
      });
      return Buffer.from(res.data);
    }
    const filePath = source.startsWith("file://")
      ? fileURLToPath(source)
      : source;
    if (!isReadablePath(filePath)) return null;
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

export function pngToIcns(png: Buffer): Buffer {
  const entry = Buffer.alloc(8);
  entry.write("ic08", 0, "ascii");
  entry.writeUInt32BE(png.length + 8, 4);

  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(png.length + 16, 4);

  return Buffer.concat([header, entry, png]);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function macShortcutPlist(
  name: string,
  identifier: string,
  hasIcon: boolean,
): string {
  const entries: [string, string][] = [
    ["CFBundleExecutable", "<string>launch</string>"],
    ["CFBundleIdentifier", `<string>${escapeXml(identifier)}</string>`],
    ["CFBundleName", `<string>${escapeXml(name)}</string>`],
    ["CFBundleDisplayName", `<string>${escapeXml(name)}</string>`],
    ["CFBundlePackageType", "<string>APPL</string>"],
    ["CFBundleShortVersionString", "<string>1.0</string>"],
    ["LSUIElement", "<true/>"],
  ];
  if (hasIcon) entries.push(["CFBundleIconFile", "<string>icon</string>"]);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    ...entries.map(([key, value]) => `  <key>${key}</key>${value}`),
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

async function isOwnMacShortcut(bundle: string): Promise<boolean> {
  const plist = await fs
    .readFile(path.join(bundle, "Contents", "Info.plist"), "utf-8")
    .catch(() => null);
  return plist?.includes(`<string>${MAC_SHORTCUT_ID_PREFIX}`) === true;
}

async function createMacShortcut(
  bundle: string,
  versionName: string,
  deepLink: string,
  imageSource: string | undefined,
): Promise<ShortcutResult> {
  if (await fs.pathExists(bundle)) {
    if (!(await isOwnMacShortcut(bundle))) {
      return { success: false, error: "shortcut name is taken" };
    }
    await fs.remove(bundle);
  }

  const buffer = imageSource ? await resolveImageBuffer(imageSource) : null;
  const png = buffer ? imageToPng256(buffer) : null;
  const identifier =
    MAC_SHORTCUT_ID_PREFIX +
    createHash("sha1").update(versionName).digest("hex").slice(0, 12);

  const contents = path.join(bundle, "Contents");
  await fs.outputFile(
    path.join(contents, "Info.plist"),
    macShortcutPlist(versionName, identifier, !!png),
  );
  await fs.outputFile(
    path.join(contents, "MacOS", "launch"),
    `#!/bin/sh\nexec /usr/bin/open -b ${MAC_LAUNCHER_ID} "${deepLink}"\n`,
    { mode: 0o755 },
  );
  if (png) {
    await fs.outputFile(path.join(contents, "Resources", "icon.icns"), pngToIcns(png));
  }

  return { success: true };
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
  rawVersionName: string,
  instance: number,
  imageSource?: string,
): Promise<ShortcutResult> {
  const versionName = assertSafeVersionName(rawVersionName);
  const deepLink = buildLaunchDeepLink(versionName, instance);
  const desktop = app.getPath("desktop");
  const fileBase = sanitizeShortcutName(versionName);

  if (process.platform === "darwin") {
    return createMacShortcut(
      path.join(desktop, `${fileBase}.app`),
      versionName,
      deepLink,
      imageSource,
    );
  }

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
      `Name=${toDesktopEntryValue(versionName)}`,
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

function rebaseIcon(icon: string, from: string, to: string): string | null {
  if (!icon || !isInsidePath(icon, from)) return null;
  return path.join(to, path.relative(from, icon));
}

export async function rebaseShortcutIcons(
  from: string,
  to: string,
): Promise<number> {
  let names: string[];
  try {
    names = await fs.readdir(app.getPath("desktop"));
  } catch {
    return 0;
  }

  let updated = 0;
  for (const name of names) {
    const shortcutPath = path.join(app.getPath("desktop"), name);

    try {
      if (process.platform === "win32" && name.toLowerCase().endsWith(".lnk")) {
        const link = shell.readShortcutLink(shortcutPath);
        const icon = rebaseIcon(link.icon ?? "", from, to);
        if (!icon) continue;
        if (
          shell.writeShortcutLink(shortcutPath, "update", {
            ...link,
            icon,
            iconIndex: link.iconIndex ?? 0,
          })
        ) {
          updated += 1;
        }
        continue;
      }

      if (process.platform === "linux" && name.endsWith(".desktop")) {
        const lines = (await fs.readFile(shortcutPath, "utf-8")).split("\n");
        let changed = false;
        const next = lines.map((line) => {
          const icon = line.startsWith("Icon=")
            ? rebaseIcon(line.slice(5), from, to)
            : null;
          if (!icon) return line;
          changed = true;
          return `Icon=${icon}`;
        });
        if (!changed) continue;
        await fs.writeFile(shortcutPath, next.join("\n"));
        updated += 1;
      }
    } catch (error) {
      console.warn(`[Shortcut] Could not update ${name}:`, error);
    }
  }

  return updated;
}
