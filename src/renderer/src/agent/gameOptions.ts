export type OptionRule = {
  min?: number;
  max?: number;
  values?: string[];
  pattern?: RegExp;
};

export const OPTION_RULES: Record<string, OptionRule> = {
  renderDistance: { min: 2, max: 32 },
  simulationDistance: { min: 5, max: 32 },
  maxFps: { min: 10, max: 260 },
  enableVsync: {},
  gamma: { min: 0, max: 1 },
  fov: { min: -1, max: 1 },
  fovEffectScale: { min: 0, max: 1 },
  screenEffectScale: { min: 0, max: 1 },
  particles: { min: 0, max: 2 },
  renderClouds: { values: ["true", "fast", "false"] },
  cloudRange: { min: 2, max: 128 },
  entityShadows: {},
  ao: {},
  biomeBlendRadius: { min: 0, max: 7 },
  mipmapLevels: { min: 0, max: 4 },
  entityDistanceScaling: { min: 0.5, max: 5 },
  graphicsMode: { min: 0, max: 2 },
  fancyGraphics: {},
  textureFiltering: { min: 0, max: 2 },
  improvedTransparency: {},
  prioritizeChunkUpdates: { min: 0, max: 2 },
  guiScale: { min: 0, max: 6 },
  bobView: {},
  autoJump: {},
  narrator: { min: 0, max: 3 },
  lang: { pattern: /^[a-z]{2,3}_[a-z]{2,4}$/i },
  tutorialStep: {
    values: [
      "none",
      "movement",
      "find_tree",
      "punch_tree",
      "open_inventory",
      "craft_planks",
    ],
  },
  skipMultiplayerWarning: {},
  onboardAccessibility: {},
  fullscreen: {},
};

export const OPTION_KEYS = Object.keys(OPTION_RULES);

const LINE = /^([A-Za-z0-9_.]+):(.*)$/;

export function readOptions(text: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match && match[1] in OPTION_RULES) values[match[1]] = match[2];
  }

  return values;
}

function unquote(raw: string): { value: string; quoted: boolean } {
  const match = /^"(.*)"$/.exec(raw);
  return match
    ? { value: match[1], quoted: true }
    : { value: raw, quoted: false };
}

export function formatOption(
  key: string,
  current: string,
  requested: unknown,
): { ok: true; raw: string } | { ok: false; error: string } {
  const rule = OPTION_RULES[key];
  if (!rule) return { ok: false, error: `${key} is not an option you may change` };

  const { value: currentValue, quoted } = unquote(current.trim());
  const wanted = String(requested ?? "").trim().replace(/^"(.*)"$/, "$1");

  if (rule.values) {
    if (!rule.values.includes(wanted)) {
      return {
        ok: false,
        error: `${key} takes one of: ${rule.values.join(", ")}`,
      };
    }
    return { ok: true, raw: quoted ? `"${wanted}"` : wanted };
  }

  if (currentValue === "true" || currentValue === "false") {
    const lower = wanted.toLowerCase();
    if (lower !== "true" && lower !== "false") {
      return { ok: false, error: `${key} takes true or false` };
    }
    return { ok: true, raw: quoted ? `"${lower}"` : lower };
  }

  if (rule.pattern) {
    if (!rule.pattern.test(wanted)) {
      return { ok: false, error: `${key} does not accept "${wanted}"` };
    }
    return { ok: true, raw: quoted ? `"${wanted}"` : wanted };
  }

  const number = Number(wanted);
  if (wanted === "" || !Number.isFinite(number)) {
    return { ok: false, error: `${key} takes a number` };
  }
  if (rule.min !== undefined && number < rule.min) {
    return { ok: false, error: `${key} cannot go below ${rule.min}` };
  }
  if (rule.max !== undefined && number > rule.max) {
    return { ok: false, error: `${key} cannot go above ${rule.max}` };
  }

  const isFloat = currentValue.includes(".");
  const raw = isFloat
    ? Number.isInteger(number)
      ? number.toFixed(1)
      : String(number)
    : String(Math.round(number));

  return { ok: true, raw: quoted ? `"${raw}"` : raw };
}

export function writeOptions(
  text: string,
  raws: Record<string, string>,
): string {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";

  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = LINE.exec(line);
      return match && match[1] in raws ? `${match[1]}:${raws[match[1]]}` : line;
    })
    .join(newline);
}

export type OptionsPlan = {
  changes: { key: string; from: string; to: string }[];
  errors: string[];
};

export function planOptions(text: string, requested: unknown): OptionsPlan {
  const current = readOptions(text);
  const plan: OptionsPlan = { changes: [], errors: [] };
  const entries =
    requested && typeof requested === "object" && !Array.isArray(requested)
      ? Object.entries(requested as Record<string, unknown>)
      : [];

  if (entries.length === 0) plan.errors.push("values must name at least one option");

  for (const [key, value] of entries) {
    if (!(key in OPTION_RULES)) {
      plan.errors.push(`${key} is not an option you may change`);
      continue;
    }
    if (!(key in current)) {
      plan.errors.push(
        `${key} is not in this instance's options.txt: this Minecraft version does not have it, or the game was never started`,
      );
      continue;
    }

    const formatted = formatOption(key, current[key], value);
    if (!formatted.ok) {
      plan.errors.push(formatted.error);
      continue;
    }
    if (formatted.raw !== current[key]) {
      plan.changes.push({ key, from: current[key], to: formatted.raw });
    }
  }

  return plan;
}
