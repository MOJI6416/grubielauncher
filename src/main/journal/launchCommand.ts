import fs from "fs";
import path from "path";

const SECRET_FLAGS = new Set(["--accessToken", "--session"]);
const CLASSPATH_FLAGS = new Set(["-cp", "-classpath", "--class-path"]);
const MODULE_PATH_FLAGS = new Set(["-p", "--module-path"]);
const JAVA_AGENT_PREFIX = "-javaagent:";
const AUTHLIB_PREFETCHED_PREFIX = "-Dauthlibinjector.yggdrasil.prefetched=";
const MAX_LISTED_MISSING = 20;

export interface MaskedArguments {
  args: string[];
  classpath: string[];
  modulePath: string[];
}

export function splitLaunchCommand(
  command: string[],
  mainClass: string,
): { java: string; jvm: string[]; game: string[] } {
  const mainIndex = command.indexOf(mainClass, 1);

  return {
    java: command[0] ?? "",
    jvm: mainIndex === -1 ? command.slice(1) : command.slice(1, mainIndex),
    game: mainIndex === -1 ? [] : command.slice(mainIndex + 1),
  };
}

export function maskLaunchArguments(
  args: string[],
  delimiter: string = path.delimiter,
): MaskedArguments {
  const masked: string[] = [];
  let classpath: string[] = [];
  let modulePath: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const hasValue = index + 1 < args.length;

    if (hasValue && CLASSPATH_FLAGS.has(arg)) {
      classpath = args[index + 1].split(delimiter).filter(Boolean);
      masked.push(arg, `<${classpath.length} entries>`);
      index += 1;
      continue;
    }

    if (hasValue && MODULE_PATH_FLAGS.has(arg)) {
      modulePath = args[index + 1].split(delimiter).filter(Boolean);
      masked.push(arg, `<${modulePath.length} entries>`);
      index += 1;
      continue;
    }

    if (hasValue && SECRET_FLAGS.has(arg)) {
      masked.push(arg, "<secret>");
      index += 1;
      continue;
    }

    if (arg.startsWith(AUTHLIB_PREFETCHED_PREFIX)) {
      masked.push(`${AUTHLIB_PREFETCHED_PREFIX}<metadata>`);
      continue;
    }

    masked.push(arg);
  }

  return { args: masked, classpath, modulePath };
}

export function javaAgentPaths(jvmArgs: string[]): string[] {
  return jvmArgs
    .filter((arg) => arg.startsWith(JAVA_AGENT_PREFIX))
    .map((arg) => {
      const value = arg.slice(JAVA_AGENT_PREFIX.length);
      const quoted = /^"([^"]+)"/.exec(value);
      if (quoted) return quoted[1];
      const separator = value.lastIndexOf("=");
      return separator > 2 ? value.slice(0, separator) : value;
    });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function describeLaunchCommand(
  command: string[],
  mainClass: string,
): Promise<Record<string, unknown>> {
  const { java, jvm, game } = splitLaunchCommand(command, mainClass);
  const maskedJvm = maskLaunchArguments(jvm);
  const maskedGame = maskLaunchArguments(game);
  const agents = javaAgentPaths(jvm);

  const required = [
    ...new Set([...maskedJvm.classpath, ...maskedJvm.modulePath, ...agents]),
  ];
  const presence = await Promise.all(required.map((entry) => exists(entry)));
  const missing = required.filter((_, index) => !presence[index]);

  return {
    java,
    javaExists: await exists(java),
    mainClass,
    jvmArgs: maskedJvm.args,
    gameArgs: maskedGame.args,
    classpathEntries: maskedJvm.classpath.length,
    modulePathEntries: maskedJvm.modulePath.length || undefined,
    javaAgents: agents.length ? agents : undefined,
    missingFiles: missing.slice(0, MAX_LISTED_MISSING),
    missingCount: missing.length,
  };
}
