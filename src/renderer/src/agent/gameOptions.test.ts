import { describe, expect, it } from "vitest";
import { formatOption, planOptions, readOptions, writeOptions } from "./gameOptions";

const MODERN = [
  "version:4671",
  "ao:true",
  "entityDistanceScaling:1.0",
  "maxFps:120",
  'renderClouds:"true"',
  "renderDistance:12",
  "lang:ru_ru",
  "key_key.jump:key.keyboard.space",
].join("\r\n");

describe("readOptions", () => {
  it("only reports the options the assistant may touch", () => {
    expect(readOptions(MODERN)).toEqual({
      ao: "true",
      entityDistanceScaling: "1.0",
      maxFps: "120",
      renderClouds: '"true"',
      renderDistance: "12",
      lang: "ru_ru",
    });
  });
});

describe("formatOption", () => {
  it("keeps the quotes a newer Minecraft writes", () => {
    expect(formatOption("renderClouds", '"true"', "fast")).toEqual({
      ok: true,
      raw: '"fast"',
    });
  });

  it("keeps the float style of the stored value", () => {
    expect(formatOption("entityDistanceScaling", "1.0", 2)).toEqual({
      ok: true,
      raw: "2.0",
    });
  });

  it("refuses values outside the safe range", () => {
    expect(formatOption("renderDistance", "12", 64).ok).toBe(false);
    expect(formatOption("gamma", "0.5", 15).ok).toBe(false);
  });

  it("checks booleans by the stored value", () => {
    expect(formatOption("ao", "true", "nope").ok).toBe(false);
    expect(formatOption("ao", "true", false)).toEqual({ ok: true, raw: "false" });
  });
});

describe("planOptions and writeOptions", () => {
  it("changes only the asked lines and keeps the rest of the file", () => {
    const plan = planOptions(MODERN, { renderDistance: 8, maxFps: 120 });

    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([{ key: "renderDistance", from: "12", to: "8" }]);

    const next = writeOptions(MODERN, { renderDistance: "8" });
    expect(next).toBe(MODERN.replace("renderDistance:12", "renderDistance:8"));
  });

  it("refuses options this version does not have and keys outside the list", () => {
    const plan = planOptions(MODERN, { simulationDistance: 8, "key_key.jump": "x" });

    expect(plan.changes).toEqual([]);
    expect(plan.errors).toHaveLength(2);
  });
});
