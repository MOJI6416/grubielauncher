import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  isLockedWhileRunning,
  touchesLockedContent,
  typesWhileRunning,
} from "./runningLock";

function project(
  id: string,
  options: {
    type?: ProjectType;
    version?: string;
    disabled?: boolean;
    pinned?: boolean;
  } = {},
): ILocalProject {
  return {
    id,
    title: id,
    description: "",
    projectType: options.type ?? ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    ...(options.pinned ? { pinned: true } : {}),
    version: {
      id: options.version ?? "1",
      files: [
        {
          filename: `${id}-${options.version ?? "1"}.jar`,
          url: "",
          sha1: "",
          size: 1,
          isServer: true,
          ...(options.disabled ? { disabled: true } : {}),
        },
      ],
      dependencies: [],
    },
  };
}

const ALL_TYPES = [
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
  ProjectType.WORLD,
];

describe("what the content tab shows while the game runs", () => {
  it("keeps mods in the instance list next to packs and shaders", () => {
    expect(typesWhileRunning(ALL_TYPES, true)).toEqual([
      ProjectType.MOD,
      ProjectType.RESOURCEPACK,
      ProjectType.SHADER,
    ]);
  });

  it("offers only packs and shaders in the catalog", () => {
    expect(typesWhileRunning(ALL_TYPES, false)).toEqual([
      ProjectType.RESOURCEPACK,
      ProjectType.SHADER,
    ]);
  });

  it("locks mods and leaves packs and shaders editable", () => {
    expect(isLockedWhileRunning(ProjectType.MOD)).toBe(true);
    expect(isLockedWhileRunning(ProjectType.DATAPACK)).toBe(true);
    expect(isLockedWhileRunning(ProjectType.RESOURCEPACK)).toBe(false);
    expect(isLockedWhileRunning(ProjectType.SHADER)).toBe(false);
  });
});

describe("changes refused while the game runs", () => {
  const base = [
    project("sodium"),
    project("iris"),
    project("faithful", { type: ProjectType.RESOURCEPACK }),
  ];

  it("refuses installing a mod", () => {
    expect(touchesLockedContent(base, [...base, project("lithium")])).toBe(
      true,
    );
  });

  it("refuses removing a mod", () => {
    expect(touchesLockedContent(base, base.slice(1))).toBe(true);
  });

  it("refuses updating a mod", () => {
    const updated = [project("sodium", { version: "2" }), ...base.slice(1)];
    expect(touchesLockedContent(base, updated)).toBe(true);
  });

  it("refuses turning a mod off", () => {
    const disabled = [project("sodium", { disabled: true }), ...base.slice(1)];
    expect(touchesLockedContent(base, disabled)).toBe(true);
  });

  it("refuses adding a datapack, which stays hidden while running", () => {
    expect(
      touchesLockedContent(base, [
        ...base,
        project("tweaks", { type: ProjectType.DATAPACK }),
      ]),
    ).toBe(true);
  });

  it("lets resource packs and shaders through", () => {
    const next = [
      ...base.slice(0, 2),
      project("bsl", { type: ProjectType.SHADER }),
    ];
    expect(touchesLockedContent(base, next)).toBe(false);
  });

  it("lets pinning a mod through, it does not touch the mods folder", () => {
    const pinned = [project("sodium", { pinned: true }), ...base.slice(1)];
    expect(touchesLockedContent(base, pinned)).toBe(false);
  });

  it("does not mind the order of the list", () => {
    expect(touchesLockedContent(base, [...base].reverse())).toBe(false);
  });
});
