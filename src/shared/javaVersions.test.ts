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

  it("maps alpha, beta and pre-classic ids to Java 8", () => {
    expect(mcVersionToJavaMajor("rd-132211")).toBe(8);
    expect(mcVersionToJavaMajor("c0.30_01c")).toBe(8);
    expect(mcVersionToJavaMajor("inf-20100618")).toBe(8);
    expect(mcVersionToJavaMajor("a1.0.17_04")).toBe(8);
    expect(mcVersionToJavaMajor("b1.7.3")).toBe(8);
  });

  it("maps snapshots by their release year and week", () => {
    expect(mcVersionToJavaMajor("16w20a")).toBe(8);
    expect(mcVersionToJavaMajor("20w14infinite")).toBe(8);
    expect(mcVersionToJavaMajor("21w18a")).toBe(8);
    expect(mcVersionToJavaMajor("21w19a")).toBe(17);
    expect(mcVersionToJavaMajor("22w13a")).toBe(17);
    expect(mcVersionToJavaMajor("23w51b")).toBe(17);
    expect(mcVersionToJavaMajor("24w03a")).toBe(21);
  });
});
