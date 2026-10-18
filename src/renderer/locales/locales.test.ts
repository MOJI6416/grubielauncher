import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@/types/Settings";
import en from "./en.json";

type Bundle = Record<string, unknown>;

const RENDERER_SRC = resolve(__dirname, "../src");
const STATIC_CALL = /\bt\(\s*"([a-zA-Z0-9_.]+)"/g;
const TEMPLATE_CALL = /\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g;

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const TRANSLATIONS = LANGUAGES.filter((language) => language.code !== "en").map(
  (language) => ({
    code: language.code,
    bundle: JSON.parse(
      readFileSync(join(__dirname, `${language.code}.json`), "utf-8"),
    ) as Bundle,
  }),
);

function flatten(bundle: Bundle, prefix = ""): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(bundle)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      value.forEach((_, index) => keys.push(`${path}.${index}`));
      continue;
    }

    if (value && typeof value === "object") {
      keys.push(...flatten(value as Bundle, path));
      continue;
    }

    keys.push(path);
  }

  return keys.sort();
}

function pluralBase(key: string): string {
  return key.replace(PLURAL_SUFFIX, "");
}

function sourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);

    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }

    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }

  return found;
}

function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();

  for (const file of sourceFiles(RENDERER_SRC)) {
    const source = readFileSync(file, "utf-8");

    for (const match of source.matchAll(STATIC_CALL)) {
      if (!keys.has(match[1])) keys.set(match[1], file);
    }
  }

  return keys;
}

function usedPrefixes(): Map<string, string> {
  const prefixes = new Map<string, string>();

  for (const file of sourceFiles(RENDERER_SRC)) {
    const source = readFileSync(file, "utf-8");

    for (const match of source.matchAll(TEMPLATE_CALL)) {
      if (!prefixes.has(match[1])) prefixes.set(match[1], file);
    }
  }

  return prefixes;
}

const enKeys = new Set(flatten(en as Bundle));
const enBases = new Set([...enKeys].map(pluralBase));

function isKnown(key: string): boolean {
  return enKeys.has(key) || enBases.has(pluralBase(key));
}

const pluralBases = new Set(
  [...enKeys].filter((key) => PLURAL_SUFFIX.test(key)).map(pluralBase),
);

const SAMPLE_COUNTS = [
  ...Array.from({ length: 200 }, (_, index) => index),
  1_000_000,
  2_000_000,
];

function integerPluralForms(code: string): string[] {
  const rules = new Intl.PluralRules(code);
  return [...new Set(SAMPLE_COUNTS.map((count) => rules.select(count)))];
}

describe("locale bundles", () => {
  it("translates ru and uk in full", () => {
    for (const code of ["ru", "uk"]) {
      const translation = TRANSLATIONS.find((item) => item.code === code);
      expect(Object.keys(translation?.bundle ?? {}).length).toBeGreaterThan(0);
    }
  });

  it.each(TRANSLATIONS.map((item) => [item.code, item.bundle] as const))(
    "keeps %s in parity with en once it is started",
    (_code, bundle) => {
      if (Object.keys(bundle).length === 0) return;

      const keys = flatten(bundle);
      const bases = new Set(keys.map(pluralBase));

      expect([...enKeys].filter((key) => !bases.has(pluralBase(key)))).toEqual(
        [],
      );
      expect(keys.filter((key) => !isKnown(key))).toEqual([]);
    },
  );

  it.each(TRANSLATIONS.map((item) => [item.code, item.bundle] as const))(
    "gives every plural key of %s each form a count can select",
    (code, bundle) => {
      if (Object.keys(bundle).length === 0) return;

      const keys = new Set(flatten(bundle));
      const missing = [...pluralBases].flatMap((base) =>
        integerPluralForms(code)
          .map((category) => `${base}_${category}`)
          .filter((key) => !keys.has(key)),
      );

      expect(missing).toEqual([]);
    },
  );

  it("resolves every statically written t(\"...\") key", () => {
    const missing: string[] = [];

    for (const [key, file] of usedKeys()) {
      if (key.endsWith(".")) continue;
      if (isKnown(key)) continue;
      missing.push(`${key} (${file.slice(RENDERER_SRC.length + 1)})`);
    }

    expect(missing).toEqual([]);
  });

  it("keeps the namespace of every t(`prefix.${…}`) key alive", () => {
    const missing: string[] = [];

    for (const [prefix, file] of usedPrefixes()) {
      if ([...enKeys].some((key) => key.startsWith(`${prefix}.`))) continue;
      missing.push(`${prefix}.* (${file.slice(RENDERER_SRC.length + 1)})`);
    }

    expect(missing).toEqual([]);
  });
});
