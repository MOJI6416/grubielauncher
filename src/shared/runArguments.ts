export type RunArgumentKind = "jvm" | "game";

const MEMORY_ARGUMENT = /^-X(?:mx|ms|mn|ss)\d+[kKmMgGtT]?$/;

const VM_BOOLEAN = /^-XX:[+-][A-Za-z][A-Za-z0-9_]*$/;
const VM_NUMBER = /^-XX:[A-Za-z][A-Za-z0-9_]*=-?\d+(?:\.\d+)?[kKmMgG]?$/;
const VM_WORD = /^-XX:[A-Za-z][A-Za-z0-9_]*=[A-Za-z]+$/;
const VM_NAME_WITH_SIDE_EFFECT =
  /^on[a-z]|file|path|dump|log|command|record|archive|flags/i;

const MODULE_FLAGS = new Set([
  "--add-opens",
  "--add-exports",
  "--add-modules",
  "--add-reads",
]);
const MODULE_VALUE = /^[A-Za-z0-9_.$*/][A-Za-z0-9_.$*/=,-]*$/;

const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_.$-]*$/;
const DENIED_PROPERTIES = [
  "java.class.path",
  "java.library.path",
  "java.system.class.loader",
  "java.security.manager",
  "sun.boot.library.path",
  "com.sun.management",
];

const PATH_VALUE_EXTENSIONS = new Set([
  "bat",
  "cfg",
  "class",
  "cmd",
  "conf",
  "csv",
  "dll",
  "dmp",
  "dylib",
  "exe",
  "hprof",
  "ini",
  "jar",
  "jfr",
  "jsa",
  "json",
  "log",
  "properties",
  "props",
  "sh",
  "so",
  "toml",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zip",
]);

const JVM_ONLY_IN_GAME = new Set([
  "-cp",
  "-classpath",
  "--class-path",
  "-jar",
  "-p",
  "-m",
  "--module",
  "--module-path",
  "--upgrade-module-path",
  "--patch-module",
]);

function argumentName(arg: string): string {
  const separator = arg.indexOf("=");
  return (separator === -1 ? arg : arg.slice(0, separator)).toLowerCase();
}

function vmOptionName(arg: string): string {
  let name = arg.slice(4);
  if (name.startsWith("+") || name.startsWith("-")) name = name.slice(1);

  const separator = name.indexOf("=");
  return separator === -1 ? name : name.slice(0, separator);
}

function looksLikeFilePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.includes("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  if (/^(?:file|jar|jrt|zip):/i.test(trimmed)) return true;
  if (/^[~/]/.test(trimmed)) return true;
  if (/^\.{1,2}\//.test(trimmed)) return true;
  if (trimmed.split("/").includes("..")) return true;

  const name = trimmed.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;

  return PATH_VALUE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function isAllowedVmOption(arg: string): boolean {
  if (!VM_BOOLEAN.test(arg) && !VM_NUMBER.test(arg) && !VM_WORD.test(arg)) {
    return false;
  }

  return !VM_NAME_WITH_SIDE_EFFECT.test(vmOptionName(arg));
}

function isAllowedSystemProperty(arg: string): boolean {
  const body = arg.slice(2);
  if (!body) return false;

  const separator = body.indexOf("=");
  const name = separator === -1 ? body : body.slice(0, separator);
  const value = separator === -1 ? "" : body.slice(separator + 1);

  if (!PROPERTY_NAME.test(name)) return false;

  const lower = name.toLowerCase();
  if (
    DENIED_PROPERTIES.some(
      (denied) => lower === denied || lower.startsWith(`${denied}.`),
    )
  ) {
    return false;
  }

  return !looksLikeFilePath(value);
}

export function isMemoryArgument(arg: string): boolean {
  return MEMORY_ARGUMENT.test(arg);
}

function isLaunchableToken(arg: unknown): arg is string {
  return typeof arg === "string" && arg !== "" && arg === arg.trim();
}

export function isAllowedJvmArgument(arg: unknown): boolean {
  if (!isLaunchableToken(arg)) return false;

  if (MEMORY_ARGUMENT.test(arg)) return true;
  if (arg.startsWith("-XX:")) return isAllowedVmOption(arg);
  if (arg.startsWith("-D")) return isAllowedSystemProperty(arg);

  const separator = arg.indexOf("=");
  if (separator !== -1 && MODULE_FLAGS.has(arg.slice(0, separator))) {
    return MODULE_VALUE.test(arg.slice(separator + 1));
  }

  return false;
}

export function isAllowedGameArgument(arg: unknown): boolean {
  if (!isLaunchableToken(arg)) return false;

  if (arg.startsWith("@")) return false;
  if (/^-(?:x|d)/i.test(arg)) return false;
  if (/^-(?:javaagent|agentlib|agentpath)[:=]/i.test(arg)) return false;

  return !JVM_ONLY_IN_GAME.has(argumentName(arg));
}

export function classifyRunArguments(
  args: string[],
  kind: RunArgumentKind,
  isAllowed?: (arg: string) => boolean,
): boolean[] {
  const allowed = new Array<boolean>(args.length).fill(false);

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (typeof arg !== "string") continue;

    if (isAllowed?.(arg)) {
      allowed[index] = true;
      continue;
    }

    if (kind === "game") {
      allowed[index] = isAllowedGameArgument(arg);
      continue;
    }

    if (MODULE_FLAGS.has(arg)) {
      const value = args[index + 1];
      if (typeof value === "string" && MODULE_VALUE.test(value)) {
        allowed[index] = true;
        allowed[index + 1] = true;
        index++;
      }
      continue;
    }

    allowed[index] = isAllowedJvmArgument(arg);
  }

  return allowed;
}

export function filterRunArguments(
  args: string[],
  kind: RunArgumentKind,
  isAllowed?: (arg: string) => boolean,
): {
  safe: string[];
  rejected: string[];
} {
  const allowed = classifyRunArguments(args, kind, isAllowed);
  const safe: string[] = [];
  const rejected: string[] = [];

  args.forEach((arg, index) => {
    if (allowed[index]) safe.push(arg);
    else rejected.push(arg);
  });

  return { safe, rejected };
}
