import { app } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { HIDDEN_START_FLAG, WINDOWS_LOGIN_ITEM_NAME } from "./launchAtLogin";
import { isUpdateLoop, isVersionBelow, UpdateAttempt } from "./updateLoopGuard";

export interface InstalledLauncher {
  exe: string;
  version: string;
}

const inspectWindows = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
$copies = @($roots | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue | ForEach-Object {
    $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
    if ($entry.DisplayName -eq 'Grubie Launcher') {
      $exe = ([string]$entry.DisplayIcon -replace ',\\s*\\d+$', '').Trim('"')
      if ([System.IO.Path]::GetFileName($exe) -eq 'Grubie Launcher.exe' -and (Test-Path -LiteralPath $exe -PathType Leaf)) {
        $info = (Get-Item -LiteralPath $exe).VersionInfo
        if ($info.ProductName -eq 'Grubie Launcher') {
          @{ exe = $exe; version = $info.ProductVersion }
        }
      }
    }
  }
})
$run = Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue
@{ copies = $copies; loginCommand = $run.'com.grubielauncher' } | ConvertTo-Json -Depth 4 -Compress
`;

export function sameWindowsExecutable(left: string, right: string): boolean {
  return (
    path.win32.resolve(left).toLowerCase() ===
    path.win32.resolve(right).toLowerCase()
  );
}

export function selectInstalledLauncher(
  copies: InstalledLauncher[],
  running: InstalledLauncher,
  hidden: boolean,
  attempt: UpdateAttempt | null,
  now: number,
): InstalledLauncher | undefined {
  const loop = isUpdateLoop(attempt, running, now);
  return copies
    .filter(
      (copy) =>
        path.win32.isAbsolute(copy.exe) &&
        path.win32.basename(copy.exe).toLowerCase() === "grubie launcher.exe" &&
        /^\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?$/.test(copy.version) &&
        !sameWindowsExecutable(copy.exe, running.exe) &&
        !isVersionBelow(copy.version, running.version) &&
        (!loop || !isVersionBelow(copy.version, attempt!.target)) &&
        (hidden || loop || isVersionBelow(running.version, copy.version)),
    )
    .sort((left, right) =>
      isVersionBelow(left.version, right.version)
        ? 1
        : isVersionBelow(right.version, left.version)
          ? -1
          : 0,
    )[0];
}

export async function recoverWindowsStartup(options: {
  hidden: boolean;
  attempt: UpdateAttempt | null;
}): Promise<boolean> {
  if (process.platform !== "win32" || !app.isPackaged) return false;
  try {
    const powershell = path.win32.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const { stdout } = await promisify(execFile)(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", inspectWindows],
      {
        windowsHide: true,
        timeout: 5000,
        encoding: "utf8",
      },
    );
    const inspected = JSON.parse(stdout);
    const copies: InstalledLauncher[] = (
      Array.isArray(inspected.copies) ? inspected.copies : []
    ).filter(
      (copy: InstalledLauncher) =>
        typeof copy?.exe === "string" && typeof copy.version === "string",
    );
    const running = { exe: process.execPath, version: app.getVersion() };
    const installed = selectInstalledLauncher(
      copies,
      running,
      options.hidden,
      options.attempt,
      Date.now(),
    );
    const startupExe =
      installed?.exe ??
      copies.find((copy) => sameWindowsExecutable(copy.exe, running.exe))
        ?.exe ??
      selectInstalledLauncher(copies, running, true, null, Date.now())?.exe;
    if (
      startupExe &&
      typeof inspected.loginCommand === "string" &&
      inspected.loginCommand
    ) {
      const expected = `"${startupExe}" ${HIDDEN_START_FLAG}`;
      if (inspected.loginCommand !== expected) {
        app.setLoginItemSettings({
          name: WINDOWS_LOGIN_ITEM_NAME,
          path: startupExe,
          args: [HIDDEN_START_FLAG],
          openAtLogin: true,
        });
        console.info(`[Startup] Repaired the login item: ${startupExe}`);
      }
    }
    if (!installed) return false;
    const args = process.argv
      .slice(1)
      .filter((arg) => arg !== HIDDEN_START_FLAG);
    if (options.hidden) args.push(HIDDEN_START_FLAG);
    console.info(
      `[Startup] Opening installed launcher ${installed.version}: ${installed.exe}`,
    );
    app.relaunch({ execPath: installed.exe, args });
    app.quit();
    return true;
  } catch (error) {
    console.warn("[Startup] Could not inspect the installed launcher:", error);
    return false;
  }
}
