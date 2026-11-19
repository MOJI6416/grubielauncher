import { describe, expect, it } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  diffContent,
  invertContent,
  isEmptyDiff,
  planTrashRestore,
  restoredItems,
} from "./contentChanges";

function mod(
  id: string,
  options: {
    version?: string;
    type?: ProjectType;
    file?: string;
    disabled?: boolean;
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
    version: {
      id: options.version ?? "1",
      files: [
        {
          filename: options.file ?? `${id}-${options.version ?? "1"}.jar`,
          url: "",
          sha1: "",
          size: 1,
          isServer: true,
          ...(options.disabled ? { disabled: true } : {}),
        },
      ],
      dependencies: [],
    },
  } as ILocalProject;
}

describe("diffContent", () => {
  it("tells added, removed and changed items apart", () => {
    const a = mod("a");
    const b = mod("b");
    const c = mod("c");
    const b2 = mod("b", { version: "2" });

    const diff = diffContent([a, b, c], [a, b2, mod("d")]);

    expect(diff.added.map((item) => item.id)).toEqual(["d"]);
    expect(diff.removed.map((item) => item.id)).toEqual(["c"]);
    expect(diff.changed).toEqual([{ before: b, after: b2 }]);
  });

  it("treats an equal copy as unchanged", () => {
    const a = mod("a");
    expect(isEmptyDiff(diffContent([a], [structuredClone(a)]))).toBe(true);
  });
});

describe("invertContent", () => {
  it("removes what an install added", () => {
    const a = mod("a");
    const sodium = mod("sodium");
    const before = [a];
    const after = [a, sodium];

    expect(invertContent(before, after, after)).toEqual([a]);
  });

  it("brings a removed item back at its old place", () => {
    const a = mod("a");
    const b = mod("b");
    const c = mod("c");

    expect(invertContent([a, b, c], [a, c], [a, c])).toEqual([a, b, c]);
  });

  it("puts the old version back after an update", () => {
    const old = mod("a", { version: "1" });
    const fresh = mod("a", { version: "2" });

    expect(invertContent([old], [fresh], [fresh])).toEqual([old]);
  });

  it("keeps changes made after the one being undone", () => {
    const a = mod("a");
    const iris = mod("iris");
    const sodium = mod("sodium");

    const afterSodium = [a, sodium];
    const current = [a, sodium, iris];

    expect(invertContent([a], afterSodium, current)).toEqual([a, iris]);
  });

  it("leaves an item alone if it was changed again since", () => {
    const v1 = mod("a", { version: "1" });
    const v2 = mod("a", { version: "2" });
    const v3 = mod("a", { version: "3" });

    expect(invertContent([v1], [v2], [v3])).toEqual([v3]);
  });

  it("does not add a removed item twice", () => {
    const a = mod("a");
    const b = mod("b");

    expect(invertContent([a, b], [a], [a, b])).toEqual([a, b]);
  });
});

describe("restoredItems", () => {
  it("lists what the undo brings back or swaps", () => {
    const a1 = mod("a", { version: "1" });
    const a2 = mod("a", { version: "2" });
    const b = mod("b");

    expect(restoredItems([a2], [a1, b])).toEqual([b, a1]);
  });
});

describe("planTrashRestore", () => {
  const since = 1_763_500_000_000;

  it("takes the newest trashed copy of each missing file", () => {
    const steps = planTrashRestore({
      items: [mod("sodium", { file: "sodium.jar" })],
      present: new Map([[ProjectType.MOD, new Set<string>()]]),
      trash: [
        `${since + 10}-0a0a0a0a-sodium.jar`,
        `${since + 500}-0b0b0b0b-sodium.jar`,
        `${since - 1000}-0c0c0c0c-sodium.jar`,
      ],
      since,
    });

    expect(steps).toEqual([
      {
        raw: `${since + 500}-0b0b0b0b-sodium.jar`,
        projectType: ProjectType.MOD,
        target: "sodium.jar",
      },
    ]);
  });

  it("keeps a disabled file disabled", () => {
    const steps = planTrashRestore({
      items: [mod("lambdynamic", { file: "lamb.jar", disabled: true })],
      present: new Map(),
      trash: [`${since + 1}-0a0a0a0a-lamb.jar.disabled`],
      since,
    });

    expect(steps[0]?.target).toBe("lamb.jar.disabled");
  });

  it("skips files that are already in place and files trashed earlier", () => {
    const steps = planTrashRestore({
      items: [mod("a", { file: "a.jar" }), mod("b", { file: "b.jar" })],
      present: new Map([[ProjectType.MOD, new Set(["a.jar"])]]),
      trash: [`${since + 1}-0a0a0a0a-a.jar`, `${since - 1}-0b0b0b0b-b.jar`],
      since,
    });

    expect(steps).toEqual([]);
  });

  it("restores into the folder of the content type", () => {
    const steps = planTrashRestore({
      items: [
        mod("faithful", {
          file: "Faithful.zip",
          type: ProjectType.RESOURCEPACK,
        }),
      ],
      present: new Map([[ProjectType.MOD, new Set<string>()]]),
      trash: [`${since + 3}-0a0a0a0a-Faithful.zip`],
      since,
    });

    expect(steps).toEqual([
      {
        raw: `${since + 3}-0a0a0a0a-Faithful.zip`,
        projectType: ProjectType.RESOURCEPACK,
        target: "Faithful.zip",
      },
    ]);
  });

  it("ignores worlds and server plugins", () => {
    const steps = planTrashRestore({
      items: [
        mod("map", { file: "map.zip", type: ProjectType.WORLD }),
        mod("ess", { file: "ess.jar", type: ProjectType.PLUGIN }),
      ],
      present: new Map(),
      trash: [`${since + 1}-0a0a0a0a-map.zip`, `${since + 1}-0b0b0b0b-ess.jar`],
      since,
    });

    expect(steps).toEqual([]);
  });
});
