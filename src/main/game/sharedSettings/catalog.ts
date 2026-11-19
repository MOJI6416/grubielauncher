import type { Loader } from "@/types/Loader";
import {
  isModernKeyName,
  legacyCodeToName,
  nameToLegacyCode,
} from "./keyCodes";

export type OptionsEra = "legacy" | "flat" | "modern";
export type OptionGroup = "controls" | "video";

type Kind = "bool" | "num" | "enum" | "ao" | "graphics" | "keybind";

interface OptionDef {
  group: OptionGroup;
  kind: Kind;
}

const CALENDAR = /^\d{2}\.\d+/;
const RELEASE = /^1\.(\d+)/;
const ANCIENT = /^(?:rd-|inf-|c0\.|a1\.|b1\.)/i;
const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/;
const TOKEN = /^[A-Za-z0-9_.-]+$/;
const MODIFIERS = new Set(["SHIFT", "CONTROL", "ALT"]);
const MODIFIER_LOADERS = new Set<Loader>(["forge", "neoforge", "cleanroom"]);

const KEYBIND_PREFIX = "key_key.";
const SOUND_PREFIX = "soundCategory_";

const OPTIONS: Record<string, OptionDef> = {
  mouseSensitivity: { group: "controls", kind: "num" },
  invertYMouse: { group: "controls", kind: "bool" },
  invertXMouse: { group: "controls", kind: "bool" },
  autoJump: { group: "controls", kind: "bool" },
  toggleCrouch: { group: "controls", kind: "bool" },
  toggleSprint: { group: "controls", kind: "bool" },
  toggleAttack: { group: "controls", kind: "bool" },
  toggleUse: { group: "controls", kind: "bool" },
  sprintWindow: { group: "controls", kind: "num" },
  discrete_mouse_scroll: { group: "controls", kind: "bool" },
  mouseWheelSensitivity: { group: "controls", kind: "num" },
  fov: { group: "video", kind: "num" },
  fovEffectScale: { group: "video", kind: "num" },
  screenEffectScale: { group: "video", kind: "num" },
  darknessEffectScale: { group: "video", kind: "num" },
  gamma: { group: "video", kind: "num" },
  guiScale: { group: "video", kind: "num" },
  particles: { group: "video", kind: "num" },
  maxFps: { group: "video", kind: "num" },
  enableVsync: { group: "video", kind: "bool" },
  fullscreen: { group: "video", kind: "bool" },
  bobView: { group: "video", kind: "bool" },
  entityShadows: { group: "video", kind: "bool" },
  graphicsMode: { group: "video", kind: "graphics" },
  graphicsPreset: { group: "video", kind: "enum" },
  cutoutLeaves: { group: "video", kind: "bool" },
  improvedTransparency: { group: "video", kind: "bool" },
  vignette: { group: "video", kind: "bool" },
  chunkSectionFadeInTime: { group: "video", kind: "num" },
  ao: { group: "video", kind: "ao" },
  renderClouds: { group: "video", kind: "enum" },
  biomeBlendRadius: { group: "video", kind: "num" },
  prioritizeChunkUpdates: { group: "video", kind: "num" },
  glintSpeed: { group: "video", kind: "num" },
  glintStrength: { group: "video", kind: "num" },
  damageTiltStrength: { group: "video", kind: "num" },
  hideLightningFlashes: { group: "video", kind: "bool" },
  inactivityFpsLimit: { group: "video", kind: "enum" },
  attackIndicator: { group: "video", kind: "num" },
  showSubtitles: { group: "video", kind: "bool" },
  directionalAudio: { group: "video", kind: "bool" },
  musicFrequency: { group: "video", kind: "enum" },
  musicToast: { group: "video", kind: "enum" },
  useVbo: { group: "video", kind: "bool" },
  fboEnable: { group: "video", kind: "bool" },
};

const DEFAULTS: Record<string, string> = {
  mouseSensitivity: "0.5",
  invertYMouse: "false",
  invertXMouse: "false",
  toggleCrouch: "false",
  toggleSprint: "false",
  toggleAttack: "false",
  toggleUse: "false",
  sprintWindow: "7",
  discrete_mouse_scroll: "false",
  mouseWheelSensitivity: "1.0",
  fov: "0.0",
  fovEffectScale: "1.0",
  screenEffectScale: "1.0",
  darknessEffectScale: "1.0",
  guiScale: "0",
  particles: "0",
  maxFps: "120",
  enableVsync: "true",
  fullscreen: "false",
  bobView: "true",
  entityShadows: "true",
  graphicsMode: "1",
  cutoutLeaves: "true",
  improvedTransparency: "false",
  vignette: "true",
  chunkSectionFadeInTime: "0.75",
  ao: "2",
  renderClouds: "true",
  biomeBlendRadius: "2",
  prioritizeChunkUpdates: "0",
  glintSpeed: "0.5",
  glintStrength: "0.75",
  damageTiltStrength: "1.0",
  hideLightningFlashes: "false",
  inactivityFpsLimit: "afk",
  attackIndicator: "1",
  showSubtitles: "false",
  directionalAudio: "false",
  musicFrequency: "DEFAULT",
  useVbo: "true",
  fboEnable: "true",
  "key_key.attack": "key.mouse.left",
  "key_key.use": "key.mouse.right",
  "key_key.forward": "key.keyboard.w",
  "key_key.left": "key.keyboard.a",
  "key_key.back": "key.keyboard.s",
  "key_key.right": "key.keyboard.d",
  "key_key.jump": "key.keyboard.space",
  "key_key.sneak": "key.keyboard.left.shift",
  "key_key.sprint": "key.keyboard.left.control",
  "key_key.drop": "key.keyboard.q",
  "key_key.inventory": "key.keyboard.e",
  "key_key.chat": "key.keyboard.t",
  "key_key.playerlist": "key.keyboard.tab",
  "key_key.pickItem": "key.mouse.middle",
  "key_key.command": "key.keyboard.slash",
  "key_key.socialInteractions": "key.keyboard.p",
  "key_key.friends": "key.keyboard.o",
  "key_key.screenshot": "key.keyboard.f2",
  "key_key.togglePerspective": "key.keyboard.f5",
  "key_key.smoothCamera": "key.keyboard.unknown",
  "key_key.fullscreen": "key.keyboard.f11",
  "key_key.spectatorOutlines": "key.keyboard.unknown",
  "key_key.spectatorHotbar": "key.mouse.middle",
  "key_key.swapOffhand": "key.keyboard.f",
  "key_key.saveToolbarActivator": "key.keyboard.c",
  "key_key.loadToolbarActivator": "key.keyboard.x",
  "key_key.advancements": "key.keyboard.l",
  "key_key.quickActions": "key.keyboard.g",
  "key_key.toggleGui": "key.keyboard.f1",
  "key_key.toggleSpectatorShaderEffects": "key.keyboard.f4",
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [
      `key_key.hotbar.${index + 1}`,
      `key.keyboard.${index + 1}`,
    ]),
  ),
};

const KEYBIND: OptionDef = { group: "controls", kind: "keybind" };
const SOUND: OptionDef = { group: "video", kind: "num" };

const LEGACY_NAMES: Record<string, { name: string; untilMinor: number }> = {
  graphicsMode: { name: "fancyGraphics", untilMinor: 16 },
  "key_key.swapOffhand": { name: "key_key.swapHands", untilMinor: 16 },
};

const CANONICAL_BY_LEGACY = new Map(
  Object.entries(LEGACY_NAMES).map(([canonical, legacy]) => [
    legacy.name,
    canonical,
  ]),
);

export function optionsEra(mcVersion: string): OptionsEra | null {
  if (ANCIENT.test(mcVersion)) return "legacy";
  if (CALENDAR.test(mcVersion)) return "modern";
  const release = RELEASE.exec(mcVersion);
  if (!release) return null;
  const minor = Number(release[1]);
  if (minor < 13) return "legacy";
  return minor < 19 ? "flat" : "modern";
}

function releaseAtLeast(mcVersion: string, minor: number): boolean {
  if (CALENDAR.test(mcVersion)) return true;
  const release = RELEASE.exec(mcVersion);
  return release ? Number(release[1]) >= minor : false;
}

export interface ManagedOption {
  canonical: string;
  group: OptionGroup;
  def: OptionDef;
}

export function definitionOf(canonical: string): OptionDef | null {
  if (canonical.startsWith(KEYBIND_PREFIX)) return KEYBIND;
  if (canonical.startsWith(SOUND_PREFIX)) return SOUND;
  return OPTIONS[canonical] ?? null;
}

export function managedOption(name: string): ManagedOption | null {
  const canonical = CANONICAL_BY_LEGACY.get(name) ?? name;
  const def = definitionOf(canonical);
  return def ? { canonical, group: def.group, def } : null;
}

export function nameFor(canonical: string, mcVersion: string): string {
  const legacy = LEGACY_NAMES[canonical];
  if (!legacy) return canonical;
  return releaseAtLeast(mcVersion, legacy.untilMinor) ? canonical : legacy.name;
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  }
  return value;
}

function decodeKeybind(raw: string): string | null {
  const [code, ...rest] = raw.trim().split(":");
  const modifier = rest.join(":").trim().toUpperCase();
  if (modifier && modifier !== "NONE" && !MODIFIERS.has(modifier)) return null;

  let key: string | null;
  if (/^-?\d+$/.test(code)) key = legacyCodeToName(Number(code));
  else key = isModernKeyName(code) ? code : null;
  if (!key) return null;

  return modifier && modifier !== "NONE" ? `${key}:${modifier}` : key;
}

export function decodeOption(
  def: OptionDef,
  name: string,
  raw: string,
): string | null {
  const value = unquote(raw);
  switch (def.kind) {
    case "bool":
      return value === "true" || value === "false" ? value : null;
    case "num":
      return NUMBER.test(value) ? value : null;
    case "enum":
      return value && TOKEN.test(value) ? value : null;
    case "ao":
      if (value === "true") return "2";
      if (value === "false") return "0";
      return /^[0-2]$/.test(value) ? value : null;
    case "graphics":
      if (name === "fancyGraphics") {
        if (value === "true") return "1";
        return value === "false" ? "0" : null;
      }
      return /^[0-2]$/.test(value) ? value : null;
    case "keybind":
      return decodeKeybind(raw);
  }
}

export interface EncodeTarget {
  mcVersion: string;
  loader: Loader;
}

function prefersQuotes(
  targetRaw: string | undefined,
  era: OptionsEra,
): boolean {
  if (targetRaw !== undefined) return targetRaw.trim().startsWith('"');
  return era === "modern";
}

function prefersBoolean(
  targetRaw: string | undefined,
  era: OptionsEra,
): boolean {
  if (targetRaw !== undefined)
    return /^(?:true|false)$/.test(unquote(targetRaw));
  return era === "modern";
}

function encodeKeybind(
  value: string,
  era: OptionsEra,
  loader: Loader,
): string | null {
  const [key, modifier] = value.split(":");
  if (modifier && !MODIFIER_LOADERS.has(loader)) return null;
  const suffix = modifier ? `:${modifier}` : "";
  if (era !== "legacy") return `${key}${suffix}`;
  const code = nameToLegacyCode(key);
  return code === null ? null : `${code}${suffix}`;
}

export function encodeOption(
  def: OptionDef,
  canonical: string,
  value: string,
  target: EncodeTarget,
  targetRaw: string | undefined,
): string | null {
  const era = optionsEra(target.mcVersion);
  if (!era) return null;
  switch (def.kind) {
    case "bool":
    case "num":
      return value;
    case "enum":
      return prefersQuotes(targetRaw, era) ? JSON.stringify(value) : value;
    case "ao":
      return prefersBoolean(targetRaw, era)
        ? Number(value) > 0
          ? "true"
          : "false"
        : value;
    case "graphics":
      return nameFor(canonical, target.mcVersion) === "fancyGraphics"
        ? Number(value) > 0
          ? "true"
          : "false"
        : value;
    case "keybind":
      return encodeKeybind(value, era, target.loader);
  }
}

const ERA_DEFAULTS: Record<string, Partial<Record<OptionsEra, string>>> = {
  gamma: { legacy: "0.0", modern: "0.5" },
  autoJump: { legacy: "true", modern: "false" },
};

export function defaultValueOf(
  canonical: string,
  mcVersion: string,
): string | null {
  if (canonical.startsWith(SOUND_PREFIX)) return "1.0";
  const byEra = ERA_DEFAULTS[canonical];
  if (byEra) {
    const era = optionsEra(mcVersion);
    return era ? (byEra[era] ?? null) : null;
  }
  return DEFAULTS[canonical] ?? null;
}

export function sameOptionValue(def: OptionDef, a: string, b: string): boolean {
  if (a === b) return true;
  if (def.kind !== "num") return false;
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left));
}
