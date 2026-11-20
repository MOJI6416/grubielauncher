import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogPresence, forgetCatalogPresence } from "./catalogPresence";
import { curseForgeFingerprint } from "./cfFingerprint";

const files: Record<string, Buffer> = {
  "/pack/overrides/mods/sodium.jar": Buffer.from("sodium from modrinth"),
  "/pack/overrides/mods/jei.jar": Buffer.from("jei from curseforge"),
  "/pack/overrides/mods/stranger.jar": Buffer.from("nobody published this"),
};

const sha1 = (data: Buffer) => createHash("sha1").update(data).digest("hex");

function deps(
  options: { modrinthDown?: boolean; curseforgeDown?: boolean } = {},
) {
  const onModrinth = new Set([sha1(files["/pack/overrides/mods/sodium.jar"])]);
  const onCurseForge = new Set([
    curseForgeFingerprint(files["/pack/overrides/mods/jei.jar"]),
  ]);
  return {
    modrinthHashes: vi.fn(async (hashes: string[]) =>
      options.modrinthDown
        ? null
        : new Set(hashes.filter((hash) => onModrinth.has(hash))),
    ),
    curseforgeFingerprints: vi.fn(async (fingerprints: number[]) =>
      options.curseforgeDown
        ? null
        : new Set(fingerprints.filter((value) => onCurseForge.has(value))),
    ),
    readFile: vi.fn(async (path: string) => {
      const data = files[path];
      if (!data) throw new Error("ENOENT");
      return data;
    }),
    download: vi.fn(async (url: string) =>
      url === "https://cdn.example.com/stranger.jar"
        ? files["/pack/overrides/mods/stranger.jar"]
        : null,
    ),
  };
}

const local = (name: string) => ({
  key: `local:${name}`,
  path: `/pack/overrides/mods/${name}`,
});

beforeEach(() => forgetCatalogPresence());

describe("catalogPresence", () => {
  it("finds a jar on Modrinth by sha1 and on CurseForge by fingerprint", async () => {
    const lookups = deps();
    const result = await catalogPresence(
      [local("sodium.jar"), local("jei.jar"), local("stranger.jar")],
      lookups,
    );

    expect(result).toEqual({ unknown: ["local:stranger.jar"], unchecked: [] });
    expect(lookups.curseforgeFingerprints).toHaveBeenCalledWith(
      expect.not.arrayContaining([
        curseForgeFingerprint(files["/pack/overrides/mods/sodium.jar"]),
      ]),
    );
  });

  it("uses a known sha1 without reading the file when Modrinth has it", async () => {
    const lookups = deps();
    const result = await catalogPresence(
      [
        {
          key: "share:sodium",
          sha1: sha1(files["/pack/overrides/mods/sodium.jar"]).toUpperCase(),
          url: "https://cdn.example.com/sodium.jar",
        },
      ],
      lookups,
    );

    expect(result).toEqual({ unknown: [], unchecked: [] });
    expect(lookups.download).not.toHaveBeenCalled();
    expect(lookups.readFile).not.toHaveBeenCalled();
  });

  it("downloads a remote jar only when Modrinth does not know it", async () => {
    const lookups = deps();
    const result = await catalogPresence(
      [
        {
          key: "share:stranger",
          sha1: sha1(files["/pack/overrides/mods/stranger.jar"]),
          url: "https://cdn.example.com/stranger.jar",
        },
        {
          key: "share:gone",
          sha1: "0".repeat(40),
          url: "https://cdn.example.com/gone.jar",
        },
      ],
      lookups,
    );

    expect(lookups.download).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      unknown: ["share:stranger"],
      unchecked: ["share:gone"],
    });
  });

  it("does not call a jar unknown when a catalog could not be asked", async () => {
    expect(
      await catalogPresence(
        [local("stranger.jar")],
        deps({ modrinthDown: true }),
      ),
    ).toEqual({ unknown: [], unchecked: ["local:stranger.jar"] });
    forgetCatalogPresence();
    expect(
      await catalogPresence(
        [local("stranger.jar")],
        deps({ curseforgeDown: true }),
      ),
    ).toEqual({ unknown: [], unchecked: ["local:stranger.jar"] });
    expect(await catalogPresence([local("missing.jar")], deps())).toEqual({
      unknown: [],
      unchecked: ["local:missing.jar"],
    });
  });

  it("remembers verdicts by hash and asks again once they are stale", async () => {
    let now = 1_000;
    const lookups = { ...deps(), now: () => now };

    await catalogPresence(
      [local("stranger.jar"), local("sodium.jar")],
      lookups,
    );
    const again = await catalogPresence(
      [local("stranger.jar"), local("sodium.jar")],
      lookups,
    );
    expect(again).toEqual({ unknown: ["local:stranger.jar"], unchecked: [] });
    expect(lookups.modrinthHashes).toHaveBeenCalledTimes(1);

    now += 7 * 60 * 60 * 1000;
    await catalogPresence(
      [local("stranger.jar"), local("sodium.jar")],
      lookups,
    );
    expect(lookups.modrinthHashes).toHaveBeenCalledTimes(2);
    expect(lookups.modrinthHashes.mock.calls[1][0]).toEqual([
      sha1(files["/pack/overrides/mods/stranger.jar"]),
    ]);
  });
});
