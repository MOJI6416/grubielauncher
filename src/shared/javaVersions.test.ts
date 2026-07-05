import { describe, expect, it } from "vitest";
import { mcVersionToJavaMajor } from "./javaVersions";

describe("mcVersionToJavaMajor", () => {
  it("maps legacy versions (<= 1.16) to Java 8", () => {
    expect(mcVersionToJavaMajor("1.7.10")).toBe(8);
    expect(mcVersionToJavaMajor("1.12.2")).toBe(8);
    expect(mcVersionToJavaMajor("1.16.5")).toBe(8);
  });

  it("maps 1.17 - 1.20.4 to Java 17", () => {
    expect(mcVersionToJavaMajor("1.17.1")).toBe(17);
    expect(mcVersionToJavaMajor("1.18.2")).toBe(17);
    expect(mcVersionToJavaMajor("1.19.2")).toBe(17);
    expect(mcVersionToJavaMajor("1.20")).toBe(17);
    expect(mcVersionToJavaMajor("1.20.1")).toBe(17);
    expect(mcVersionToJavaMajor("1.20.4")).toBe(17);
  });

  it("maps 1.20.5+ and 1.21+ to Java 21", () => {
    expect(mcVersionToJavaMajor("1.20.5")).toBe(21);
    expect(mcVersionToJavaMajor("1.20.6")).toBe(21);
    expect(mcVersionToJavaMajor("1.21")).toBe(21);
    expect(mcVersionToJavaMajor("1.21.4")).toBe(21);
  });

  it("defaults to 21 for unknown or snapshot versions", () => {
    expect(mcVersionToJavaMajor("")).toBe(21);
    expect(mcVersionToJavaMajor("24w14a")).toBe(21);
  });
});
