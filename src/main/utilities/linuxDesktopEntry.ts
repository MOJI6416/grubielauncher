import { execFile } from "child_process";
import os from "os";
import path from "path";
import fs from "fs-extra";

const DESKTOP_FILE_NAME = "grubie-launcher.desktop";

function readEntryValue(content: string, key: string): string | null {
  const line = content
    .split("\n")
    .find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : null;
}

function run(command: string, args: string[]): void {
  try {
    execFile(command, args, () => {});
  } catch {}
}

async function installIcon(
  appDir: string,
  iconName: string | null,
): Promise<void> {
  if (!iconName || path.isAbsolute(iconName)) return;

  const source = path.join(appDir, `${iconName}.png`);
  if (!(await fs.pathExists(source))) return;

  const buffer = await fs.readFile(source);
  if (buffer.length < 24) return;

  const width = buffer.readUInt32BE(16);
  if (!width || width > 1024) return;

  const target = path.join(
    os.homedir(),
    ".local",
    "share",
    "icons",
    "hicolor",
    `${width}x${width}`,
    "apps",
    `${iconName}.png`,
  );

  await fs.outputFile(target, buffer);
}

export async function registerAppImageDesktopEntry(
  scheme: string,
): Promise<void> {
  if (process.platform !== "linux") return;

  const appImagePath = process.env["APPIMAGE"];
  const appDir = process.env["APPDIR"];
  if (!appImagePath || !appDir) return;

  try {
    const entryName = (await fs.readdir(appDir)).find((name) =>
      name.endsWith(".desktop"),
    );
    if (!entryName) return;

    const source = await fs.readFile(path.join(appDir, entryName), "utf-8");
    const mimeTypes = readEntryValue(source, "MimeType") || "";
    const schemeHandler = `x-scheme-handler/${scheme}`;

    const lines = source
      .split("\n")
      .filter((line) => !line.startsWith("TryExec="))
      .map((line) => {
        if (line.startsWith("Exec=")) return `Exec="${appImagePath}" %u`;
        if (line.startsWith("MimeType=") && !mimeTypes.includes(schemeHandler))
          return `MimeType=${mimeTypes}${mimeTypes.endsWith(";") || !mimeTypes ? "" : ";"}${schemeHandler};`;
        return line;
      });

    const applicationsDir = path.join(
      os.homedir(),
      ".local",
      "share",
      "applications",
    );
    await fs.outputFile(
      path.join(applicationsDir, DESKTOP_FILE_NAME),
      `${lines.join("\n").trim()}\n`,
    );

    await installIcon(appDir, readEntryValue(source, "Icon"));

    run("update-desktop-database", [applicationsDir]);
    run("xdg-mime", ["default", DESKTOP_FILE_NAME, schemeHandler]);
  } catch (error) {
    console.warn("Failed to register AppImage desktop entry:", error);
  }
}
