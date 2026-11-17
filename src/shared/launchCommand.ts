export function splitCommandLine(input: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === "\\" && /["\\$`]/.test(input[index + 1] ?? "")) {
        current += input[index + 1];
        index++;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === "\\" && index + 1 < input.length) {
      current += input[index + 1];
      hasToken = true;
      index++;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasToken) tokens.push(current);
      current = "";
      hasToken = false;
      continue;
    }

    current += char;
    hasToken = true;
  }

  if (quote) return null;
  if (hasToken) tokens.push(current);
  return tokens;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface LaunchEnvironment {
  env: Record<string, string>;
  invalid: string[];
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value[value.length - 1] === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseLaunchEnv(text: string | undefined): LaunchEnvironment {
  const env: Record<string, string> = {};
  const invalid: string[] = [];

  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    const name = separator > 0 ? line.slice(0, separator).trim() : "";
    if (!ENV_NAME.test(name)) {
      invalid.push(line);
      continue;
    }

    env[name] = unquote(line.slice(separator + 1).trim());
  }

  return { env, invalid };
}

export type LinuxLaunchTool = "gamemode" | "mangohud";

export const LINUX_LAUNCH_TOOL_COMMANDS: Record<LinuxLaunchTool, string> = {
  gamemode: "gamemoderun",
  mangohud: "mangohud",
};

export interface LinuxLaunchTools {
  installed: Record<LinuxLaunchTool, boolean>;
  nvidia: boolean;
}

export interface LaunchPrefix {
  prefix: string[];
  missing: LinuxLaunchTool[];
  invalidWrapper: boolean;
}

export function linuxLaunchPrefix(input: {
  wrapperCommand?: string;
  gameMode?: boolean;
  mangoHud?: boolean;
  installed: Record<LinuxLaunchTool, boolean>;
}): LaunchPrefix {
  const wrapper = splitCommandLine(input.wrapperCommand ?? "");
  const prefix = [...(wrapper ?? [])];
  const missing: LinuxLaunchTool[] = [];

  const wanted: [LinuxLaunchTool, boolean | undefined][] = [
    ["gamemode", input.gameMode],
    ["mangohud", input.mangoHud],
  ];

  for (const [tool, enabled] of wanted) {
    if (!enabled) continue;
    const command = LINUX_LAUNCH_TOOL_COMMANDS[tool];
    if (prefix.includes(command)) continue;
    if (!input.installed[tool]) {
      missing.push(tool);
      continue;
    }
    prefix.push(command);
  }

  return { prefix, missing, invalidWrapper: wrapper === null };
}

export interface LaunchHookRefusal {
  refused: "preLaunchHook";
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

export type LaunchOutcome = boolean | LaunchHookRefusal;

export function isLaunchRefusal(value: unknown): value is LaunchHookRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { refused?: unknown }).refused === "preLaunchHook"
  );
}
