import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { USAGE_FEATURES } from "./usageFeatures";

const LAUNCHER = resolve(__dirname, "../..");
const WORKSPACE = resolve(LAUNCHER, "..");
const API_IDS = join(WORKSPACE, "api/src/feature-usage/feature-ids.ts");
const DASHBOARD_LABELS = join(
  WORKSPACE,
  "dashboard/src/pages/features/featureLabels.ts",
);

const ROUTE_PREFIXES = ["screen.", "instance.", "profile.", "people.", "settings."];

function block(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `${start} not found`).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, `${end} not found after ${start}`).toBeGreaterThan(from);
  return source.slice(from + start.length, to);
}

function apiIds(): string[] {
  const source = readFileSync(API_IDS, "utf8");
  const list = block(source, "export const FEATURE_IDS = [", "] as const");
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function dashboardIds(): string[] {
  const source = readFileSync(DASHBOARD_LABELS, "utf8").replace(/\r\n/g, "\n");
  const map = block(source, "export const FEATURES", "\n}\n");
  return [...map.matchAll(/^\s*'([^']+)':\s*\{/gm)].map((match) => match[1]);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [full];
  });
}

describe("usage features", () => {
  it("lists every feature once", () => {
    expect(new Set(USAGE_FEATURES).size).toBe(USAGE_FEATURES.length);
  });

  it("uses only short dotted ids", () => {
    for (const feature of USAGE_FEATURES) {
      expect(feature).toMatch(/^[a-z][a-zA-Z]*\.[a-zA-Z]+$/);
      expect(feature.length).toBeLessThanOrEqual(32);
    }
  });

  it("counts every feature that does not come from a route", () => {
    const code = [
      ...sourceFiles(join(LAUNCHER, "src/renderer/src")),
      ...sourceFiles(join(LAUNCHER, "src/main")),
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    const unused = USAGE_FEATURES.filter(
      (feature) =>
        !ROUTE_PREFIXES.some((prefix) => feature.startsWith(prefix)) &&
        !code.includes(`"${feature}"`),
    );
    expect(unused).toEqual([]);
  });

  it.skipIf(!existsSync(API_IDS))("matches the api list", () => {
    expect([...apiIds()].sort()).toEqual([...USAGE_FEATURES].sort());
  });

  it.skipIf(!existsSync(DASHBOARD_LABELS))("has a dashboard label for each feature", () => {
    expect([...dashboardIds()].sort()).toEqual([...USAGE_FEATURES].sort());
  });
});
