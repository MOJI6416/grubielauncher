export type ArgKind = "jvm" | "game";

export type ArgSeverity = "error" | "warning";

export type ArgDiagnosticCode =
  | "malformed"
  | "duplicate"
  | "gcConflict"
  | "memoryOverride"
  | "wrongTabGame"
  | "wrongTabJvm"
  | "managed";

export interface ArgDiagnostic {
  index: number;
  token: string;
  severity: ArgSeverity;
  code: ArgDiagnosticCode;
  flag?: string;
  value?: string;
}

export interface CatalogEntry {
  id: string;
  value: string;
  kind: ArgKind;
  takesValue?: boolean;
}

export interface PresetEntry {
  id: string;
  kind: ArgKind;
  args: string[];
}

export function parseArgs(input?: string): string[] {
  if (!input?.trim()) return [];

  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\\" && (next === '"' || next === "'")) {
      current += next;
      index++;
      continue;
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote === char ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);

  return args;
}

export function serializeArgs(tokens: string[]): string {
  return tokens
    .map((token) => {
      if (token === "") return '""';
      if (/[\s"']/.test(token)) return `"${token.replace(/"/g, '\\"')}"`;
      return token;
    })
    .join(" ");
}

const GAME_FLAGS = new Set([
  "--width",
  "--height",
  "--server",
  "--port",
  "--fullscreen",
  "--demo",
  "--quickPlaySingleplayer",
  "--quickPlayMultiplayer",
  "--quickPlayRealms",
  "--quickPlayPath",
]);

const MANAGED_JVM = new Set(["-cp", "-classpath", "--class-path", "-jar"]);

const MANAGED_GAME = new Set([
  "--username",
  "--uuid",
  "--accessToken",
  "--version",
  "--gameDir",
  "--assetsDir",
  "--assetIndex",
  "--userType",
  "--versionType",
  "--userProperties",
  "--clientId",
  "--xuid",
]);

const GC_RE = /^-XX:\+Use\w*GC$/;
const JVM_IN_GAME_RE = /^-(D|X|javaagent:|agentlib:|agentpath:)/;
const MEMORY_RE = /^-Xm[xs]/;

function isMalformedJvm(token: string): boolean {
  if (/^-X(mx|ms|mn|ss)/.test(token)) {
    return !/^-X(?:mx|ms|mn|ss)\d+[kKmMgG]?$/.test(token);
  }

  if (token.startsWith("-XX:")) {
    return !(/^-XX:[+-]\w+$/.test(token) || /^-XX:\w[\w.]*=.+$/.test(token));
  }

  return false;
}

function argKey(token: string): string {
  if (token.startsWith("-XX:")) {
    const body = token.slice(4).replace(/^[+-]/, "");
    const eq = body.indexOf("=");
    return "-XX:" + (eq >= 0 ? body.slice(0, eq) : body);
  }

  if (token.startsWith("-D")) {
    const eq = token.indexOf("=");
    return eq >= 0 ? token.slice(0, eq) : token;
  }

  const mem = token.match(/^(-X(?:mx|ms|mn|ss))/);
  if (mem) return mem[1];

  return token;
}

export function analyzeArgs(
  kind: ArgKind,
  tokens: string[],
  xmx: number,
): ArgDiagnostic[] {
  const diagByIndex = new Map<number, ArgDiagnostic>();
  const gcIndices: number[] = [];
  const firstKey = new Map<string, number>();

  tokens.forEach((token, index) => {
    if (GC_RE.test(token)) gcIndices.push(index);
  });

  const set = (
    index: number,
    severity: ArgSeverity,
    code: ArgDiagnosticCode,
    extra?: { flag?: string; value?: string },
  ) => {
    if (!diagByIndex.has(index)) {
      diagByIndex.set(index, {
        index,
        token: tokens[index],
        severity,
        code,
        ...extra,
      });
    }
  };

  tokens.forEach((token, index) => {
    const base = token.split("=")[0];

    if (kind === "jvm" && MANAGED_JVM.has(base)) {
      set(index, "error", "managed", { flag: base });
      return;
    }

    if (kind === "game" && MANAGED_GAME.has(base)) {
      set(index, "error", "managed", { flag: base });
      return;
    }

    if (kind === "jvm" && GAME_FLAGS.has(token)) {
      set(index, "error", "wrongTabGame", { flag: token });
      return;
    }

    if (kind === "game" && JVM_IN_GAME_RE.test(token)) {
      set(index, "error", "wrongTabJvm", { flag: token });
      return;
    }

    if (kind === "jvm" && token.startsWith("-") && isMalformedJvm(token)) {
      set(index, "error", "malformed", { flag: token });
      return;
    }

    if (gcIndices.length > 1 && gcIndices.includes(index)) {
      set(index, "error", "gcConflict", { flag: token });
      return;
    }

    if (kind === "jvm" && MEMORY_RE.test(token)) {
      const flag = token.match(/^(-Xm[xs])/)?.[1] ?? token;
      set(index, "warning", "memoryOverride", { flag, value: String(xmx) });
      return;
    }

    if (token.startsWith("-")) {
      const key = argKey(token);
      if (firstKey.has(key)) set(index, "warning", "duplicate", { flag: key });
      else firstKey.set(key, index);
    }
  });

  return [...diagByIndex.values()].sort((a, b) => a.index - b.index);
}

export const ARG_CATALOG: CatalogEntry[] = [
  { id: "utf8", value: "-Dfile.encoding=UTF-8", kind: "jvm" },
  { id: "g1gc", value: "-XX:+UseG1GC", kind: "jvm" },
  { id: "zgc", value: "-XX:+UseZGC", kind: "jvm" },
  { id: "parallelgc", value: "-XX:+UseParallelGC", kind: "jvm" },
  { id: "unlockExp", value: "-XX:+UnlockExperimentalVMOptions", kind: "jvm" },
  { id: "gcPause", value: "-XX:MaxGCPauseMillis=200", kind: "jvm" },
  { id: "fullTrace", value: "-XX:-OmitStackTraceInFastThrow", kind: "jvm" },
  { id: "ipv4", value: "-Djava.net.preferIPv4Stack=true", kind: "jvm" },
  { id: "preTouch", value: "-XX:+AlwaysPreTouch", kind: "jvm" },
  { id: "gcLog", value: "-Xlog:gc", kind: "jvm" },
  {
    id: "forgeCerts",
    value: "-Dfml.ignoreInvalidMinecraftCertificates=true",
    kind: "jvm",
  },
  { id: "lwjglDebug", value: "-Dorg.lwjgl.util.Debug=true", kind: "jvm" },
  { id: "width", value: "--width", kind: "game", takesValue: true },
  { id: "height", value: "--height", kind: "game", takesValue: true },
  { id: "server", value: "--server", kind: "game", takesValue: true },
  { id: "port", value: "--port", kind: "game", takesValue: true },
  { id: "fullscreen", value: "--fullscreen", kind: "game" },
  { id: "demo", value: "--demo", kind: "game" },
];

export const ARG_PRESETS: PresetEntry[] = [
  { id: "utf8", kind: "jvm", args: ["-Dfile.encoding=UTF-8"] },
  { id: "fullTrace", kind: "jvm", args: ["-XX:-OmitStackTraceInFastThrow"] },
  { id: "gcLog", kind: "jvm", args: ["-Xlog:gc"] },
  { id: "ipv4", kind: "jvm", args: ["-Djava.net.preferIPv4Stack=true"] },
  {
    id: "window720",
    kind: "game",
    args: ["--width", "1280", "--height", "720"],
  },
  { id: "fullscreen", kind: "game", args: ["--fullscreen"] },
];
