import { describe, expect, it } from "vitest";
import { analyzeArgs, parseArgs, serializeArgs } from "./jvmArguments";

describe("parseArgs / serializeArgs", () => {
  it("splits on whitespace", () => {
    expect(parseArgs("-Xmx4G -XX:+UseG1GC")).toEqual([
      "-Xmx4G",
      "-XX:+UseG1GC",
    ]);
  });

  it("keeps quoted values together", () => {
    expect(parseArgs('-Dprop="a b"')).toEqual(["-Dprop=a b"]);
  });

  it("round-trips tokens with spaces and quotes", () => {
    for (const tokens of [
      ["-Dprop=a b"],
      ["--quickPlaySingleplayer", "My World"],
      ["-Dname=it's"],
      ['-Dpath=say "hi"'],
    ]) {
      expect(parseArgs(serializeArgs(tokens))).toEqual(tokens);
    }
  });
});

describe("analyzeArgs", () => {
  it("passes clean jvm arguments", () => {
    expect(
      analyzeArgs("jvm", ["-XX:+UseG1GC", "-Dfile.encoding=UTF-8"], 2048),
    ).toEqual([]);
  });

  it("flags malformed flags", () => {
    expect(analyzeArgs("jvm", ["-Xmxx"], 2048)[0].code).toBe("malformed");
    expect(analyzeArgs("jvm", ["-XX:Foo"], 2048)[0].code).toBe("malformed");
  });

  it("flags duplicate keys on the later token", () => {
    const diags = analyzeArgs("jvm", ["-Dfoo=1", "-Dfoo=2"], 2048);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      index: 1,
      code: "duplicate",
      severity: "warning",
    });
  });

  it("flags conflicting garbage collectors", () => {
    const diags = analyzeArgs("jvm", ["-XX:+UseG1GC", "-XX:+UseZGC"], 2048);
    expect(diags.map((diagnostic) => diagnostic.code)).toEqual([
      "gcConflict",
      "gcConflict",
    ]);
  });

  it("warns when memory overrides the settings", () => {
    const diags = analyzeArgs("jvm", ["-Xmx4G"], 2048);
    expect(diags[0]).toMatchObject({
      code: "memoryOverride",
      severity: "warning",
      flag: "-Xmx",
      value: "2048",
    });
  });

  it("detects a game argument on the jvm tab", () => {
    expect(analyzeArgs("jvm", ["--width"], 2048)[0].code).toBe("wrongTabGame");
  });

  it("detects a jvm argument on the game tab", () => {
    expect(analyzeArgs("game", ["-Dfoo=bar"], 2048)[0].code).toBe(
      "wrongTabJvm",
    );
  });

  it("flags launcher-managed arguments", () => {
    expect(analyzeArgs("jvm", ["-cp"], 2048)[0].code).toBe("managed");
    expect(analyzeArgs("game", ["--username"], 2048)[0].code).toBe("managed");
  });
});
