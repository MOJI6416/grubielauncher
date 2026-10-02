const APPIMAGE_VARS = ["APPDIR", "APPIMAGE", "ARGV0", "OWD"];
const APPIMAGE_LIST_VARS = [
  "LD_LIBRARY_PATH",
  "PATH",
  "XDG_DATA_DIRS",
  "GSETTINGS_SCHEMA_DIR",
];

export function childProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const appDir = env["APPDIR"]?.replace(/\/+$/, "");
  if (!appDir || !env["APPIMAGE"]) return env;

  const isBundled = (entry: string) =>
    entry === appDir || entry.startsWith(`${appDir}/`);
  const result = { ...env };
  for (const key of APPIMAGE_VARS) delete result[key];
  for (const key of APPIMAGE_LIST_VARS) {
    const value = result[key];
    if (value === undefined) continue;
    const kept = value
      .split(":")
      .filter((entry) => entry !== "" && !isBundled(entry));
    if (kept.length > 0) result[key] = kept.join(":");
    else delete result[key];
  }
  return result;
}
