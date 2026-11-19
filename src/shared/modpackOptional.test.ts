import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  isOptionalOnClient,
  isProjectEnabled,
  optionalSummary,
  setOptionalEnabled,
  withProjectEnabled,
} from "./modpackOptional";

function project(id: string, disabled?: boolean): ILocalProject {
  return {
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.CURSEFORGE,
    id,
    version: {
      id: `${id}-v1`,
      dependencies: [],
      files: [
        {
          filename: `${id}.jar`,
          size: 10,
          sha1: `${id}-sha1`,
          url: `https://cdn.example/${id}.jar`,
          isServer: true,
          ...(disabled ? { disabled: true } : {}),
        },
      ],
    },
  };
}

describe("isOptionalOnClient", () => {
  it("only treats an explicit optional client side as optional", () => {
    expect(isOptionalOnClient({ client: "optional" })).toBe(true);
    expect(isOptionalOnClient({ client: "required" })).toBe(false);
    expect(isOptionalOnClient({ client: "unsupported" })).toBe(false);
    expect(isOptionalOnClient(undefined)).toBe(false);
  });
});

describe("withProjectEnabled", () => {
  it("turns every file of a project off and back on", () => {
    const off = withProjectEnabled(project("a"), false);
    expect(off.version?.files.every((file) => file.disabled === true)).toBe(true);
    expect(isProjectEnabled(off)).toBe(false);

    const on = withProjectEnabled(off, true);
    expect(on.version?.files[0]).not.toHaveProperty("disabled");
    expect(isProjectEnabled(on)).toBe(true);
  });
});

describe("setOptionalEnabled", () => {
  const mods = [project("required"), project("extra", true)];
  const optional = ["curseforge:extra"];

  it("turns an optional file on without touching the rest", () => {
    const next = setOptionalEnabled(mods, optional, ["curseforge:extra"], true);

    expect(isProjectEnabled(next[1])).toBe(true);
    expect(next[0]).toBe(mods[0]);
  });

  it("refuses to switch off a file the author did not mark as optional", () => {
    const next = setOptionalEnabled(mods, optional, ["curseforge:required"], false);

    expect(next).toBe(mods);
    expect(isProjectEnabled(next[0])).toBe(true);
  });
});

describe("optionalSummary", () => {
  it("counts optional files and how many of them stay on", () => {
    const mods = [project("required"), project("on"), project("off", true)];

    expect(
      optionalSummary(mods, ["curseforge:on", "curseforge:off"]),
    ).toEqual({ total: 2, enabled: 1 });
    expect(optionalSummary(mods, undefined)).toEqual({ total: 0, enabled: 0 });
  });
});
