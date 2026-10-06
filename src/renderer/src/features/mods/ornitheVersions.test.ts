import { describe, expect, it } from "vitest";
import type { IVersion as ModVersion } from "@/types/ModManager";
import {
  createOrnitheVersionGuard,
  findGenerationVersion,
} from "./ornitheVersions";

function version(id: string): ModVersion {
  return {
    id,
    name: id,
    dependencies: [],
    downloads: 0,
    files: [
      {
        filename: `${id}.jar`,
        size: 1,
        sha1: "",
        url: `https://cdn.modrinth.com/${id}.jar`,
        isServer: false,
      },
    ],
  };
}

function urlId(url: string) {
  return url.replace("https://cdn.modrinth.com/", "").replace(".jar", "");
}

const osl = [
  "0.22.0",
  "0.21.1",
  "0.21.0",
  "0.20.3",
  "0.20.2",
  "0.20.1",
  "0.20.0",
  "0.19.3",
  "0.19.2",
  "0.19.1",
  "0.19.0",
  "0.18.0",
  "0.17.2",
  "0.17.1",
  "0.17.0",
  "0.16.3",
  "0.16.2",
].map(version);
const gen1 = new Set(["0.16.3", "0.16.2"]);

describe("findGenerationVersion", () => {
  it("keeps the newest version when it already fits", async () => {
    const probed: string[] = [];
    const picked = await findGenerationVersion(osl, 2, async (item) => {
      probed.push(item.files[0].url);
      return 2;
    });

    expect(picked?.id).toBe("0.22.0");
    expect(probed).toHaveLength(1);
  });

  it("finds the newest build of the other generation in a few probes", async () => {
    const probed = new Set<string>();
    const picked = await findGenerationVersion(osl, 1, async (item) => {
      const id = urlId(item.files[0].url);
      probed.add(id);
      return gen1.has(id) ? 1 : 2;
    });

    expect(picked?.id).toBe("0.16.3");
    expect(probed.size).toBeLessThanOrEqual(6);
  });

  it("accepts builds that do not touch game classes", async () => {
    const picked = await findGenerationVersion(osl, 1, async () => null);
    expect(picked?.id).toBe("0.22.0");
  });

  it("falls back to the newest build when nothing could be checked", async () => {
    const picked = await findGenerationVersion(osl, 1, async () => undefined);
    expect(picked?.id).toBe("0.22.0");
  });
});

describe("createOrnitheVersionGuard", () => {
  const probe = async (url: string) => ({
    generation:
      gen1.has(urlId(url)) || urlId(url).startsWith("tweakeroo") ? 1 : 2,
  });

  it("matches dependencies to the generation of the mod that needs them", async () => {
    const guard = createOrnitheVersionGuard({
      minecraftVersion: "1.12.2",
      instanceGeneration: 2,
      probe,
    });

    const root = await guard.pick([version("tweakeroo-0.40.1")]);
    const dependency = await guard.pick(osl, root);

    expect(root?.id).toBe("tweakeroo-0.40.1");
    expect(dependency?.id).toBe("0.16.3");
  });

  it("follows the instance generation for mods picked on their own", async () => {
    const guard = createOrnitheVersionGuard({
      minecraftVersion: "1.12.2",
      instanceGeneration: 1,
      probe,
    });

    expect((await guard.pick(osl))?.id).toBe("0.16.3");
  });

  it("refuses updates that move a mod to another generation", async () => {
    const guard = createOrnitheVersionGuard({
      minecraftVersion: "1.12.2",
      instanceGeneration: 1,
      probe,
    });

    expect(
      await guard.keepsGeneration(version("0.16.2"), version("0.22.0")),
    ).toBe(false);
    expect(
      await guard.keepsGeneration(version("0.16.2"), version("0.16.3")),
    ).toBe(true);
  });
});
