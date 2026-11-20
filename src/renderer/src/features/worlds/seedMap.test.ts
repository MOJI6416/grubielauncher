import { describe, expect, it } from "vitest";
import { chunkbasePlatform, seedMapUrl } from "./seedMap";

describe("chunkbasePlatform", () => {
  it("maps releases to the ranges Chunkbase offers", () => {
    expect(chunkbasePlatform("1.7.10")).toBe("java_1_7");
    expect(chunkbasePlatform("1.12.2")).toBe("java_1_12");
    expect(chunkbasePlatform("1.19.2")).toBe("java_1_19");
    expect(chunkbasePlatform("1.19.4")).toBe("java_1_19_3");
    expect(chunkbasePlatform("1.20.6")).toBe("java_1_20");
    expect(chunkbasePlatform("1.21")).toBe("java_1_21");
    expect(chunkbasePlatform("1.21.1")).toBe("java_1_21");
    expect(chunkbasePlatform("1.21.3")).toBe("java_1_21_2");
    expect(chunkbasePlatform("1.21.4")).toBe("java_1_21_4");
    expect(chunkbasePlatform("1.21.5")).toBe("java_1_21_5");
    expect(chunkbasePlatform("1.21.8")).toBe("java_1_21_6");
    expect(chunkbasePlatform("1.21.11")).toBe("java_1_21_9");
    expect(chunkbasePlatform("1.21.5-pre2")).toBe("java_1_21_5");
  });

  it("maps the yearly versions and leaves unknown ones to the default", () => {
    expect(chunkbasePlatform("26.1")).toBe("java_26_1");
    expect(chunkbasePlatform("26.3.1")).toBe("java_26_3");
    expect(chunkbasePlatform("26.4")).toBe("java_26_4");
    expect(chunkbasePlatform("26.5")).toBeNull();
    expect(chunkbasePlatform("27.1")).toBeNull();
    expect(chunkbasePlatform("24w14a")).toBeNull();
    expect(chunkbasePlatform(undefined)).toBeNull();
  });

  it("refuses versions the map cannot draw", () => {
    expect(chunkbasePlatform("1.6.4")).toBe("unsupported");
    expect(chunkbasePlatform("b1.7.3")).toBe("unsupported");
    expect(chunkbasePlatform("a1.2.6")).toBe("unsupported");
  });
});

describe("seedMapUrl", () => {
  it("opens the map at the spawn", () => {
    expect(
      seedMapUrl({
        seed: "-4172144997902289642",
        version: "1.20.1",
        spawn: { x: 120.4, z: -32 },
      }),
    ).toBe(
      "https://www.chunkbase.com/apps/seed-map#seed=-4172144997902289642&platform=java_1_20&dimension=overworld&x=120&z=-32",
    );
  });

  it("skips the platform it does not know and refuses bad seeds", () => {
    expect(seedMapUrl({ seed: "42", version: "27.1" })).toBe(
      "https://www.chunkbase.com/apps/seed-map#seed=42&dimension=overworld",
    );
    expect(seedMapUrl({ seed: "", version: "1.20.1" })).toBeNull();
    expect(seedMapUrl({ seed: "abc", version: "1.20.1" })).toBeNull();
    expect(seedMapUrl({ seed: "42", version: "b1.7.3" })).toBeNull();
  });
});
