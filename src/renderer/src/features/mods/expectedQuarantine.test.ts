import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  expectQuarantine,
  fileNamesOf,
  unexpectedQuarantine,
} from "./expectedQuarantine";

function mod(file: string): ILocalProject {
  return {
    id: file,
    title: file,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    version: {
      id: "1",
      files: [{ filename: file, url: "", sha1: "", size: 1, isServer: true }],
      dependencies: [],
    },
  };
}

describe("expected quarantine", () => {
  it("hides files the player removed on purpose", () => {
    const release = expectQuarantine("Pack", fileNamesOf([mod("sodium.jar")]));

    expect(
      unexpectedQuarantine("Pack", ["sodium.jar", "stray.jar"]),
    ).toEqual(["stray.jar"]);

    release();
    expect(unexpectedQuarantine("Pack", ["sodium.jar"])).toEqual([
      "sodium.jar",
    ]);
  });

  it("matches disabled copies and ignores case", () => {
    const release = expectQuarantine("Pack", ["Iris.jar"]);
    expect(unexpectedQuarantine("Pack", ["iris.jar.disabled"])).toEqual([]);
    release();
  });

  it("keeps other instances out of it", () => {
    const release = expectQuarantine("Pack", ["a.jar"]);
    expect(unexpectedQuarantine("Other", ["a.jar"])).toEqual(["a.jar"]);
    release();
  });

  it("keeps a name expected while another change still waits for it", () => {
    const first = expectQuarantine("Pack", ["a.jar"]);
    const second = expectQuarantine("Pack", ["a.jar"]);

    first();
    expect(unexpectedQuarantine("Pack", ["a.jar"])).toEqual([]);
    second();
    expect(unexpectedQuarantine("Pack", ["a.jar"])).toEqual(["a.jar"]);
  });
});
