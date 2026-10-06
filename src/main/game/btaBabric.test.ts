import os from "os";
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IVersionManifest } from "@/types/IVersionManifest";
import {
  applyBabricLayer,
  hasBabricLayer,
  instanceJvmProperties,
  readTurnipInstance,
  turnipInstanceUrls,
} from "./btaBabric";

let root: string;

function writeInstance(
  target: string,
  files: Record<string, unknown>,
  prefix = "",
) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(
      prefix + name,
      Buffer.isBuffer(content)
        ? content
        : Buffer.from(typeof content === "string" ? content : JSON.stringify(content)),
    );
  }
  zip.writeZip(target);
}

function turnip801(prefix = "") {
  const target = path.join(root, `turnip${prefix ? "-nested" : ""}.zip`);
  writeInstance(
    target,
    {
      "mmc-pack.json": {
        components: [
          { uid: "org.lwjgl", version: "3.3.3" },
          { uid: "net.minecraft", version: "b1.7.3" },
          { uid: "custom.jarmod.bta", cachedVersion: "v8.0.1" },
          { uid: "net.fabricmc.fabric-loader", version: "0.18.4-bta.11" },
        ],
      },
      "instance.cfg": '[General]\nJvmArgs="-Djava.awt.headless=true -Xmx2G"\n',
      "patches/org.lwjgl.json": {
        libraries: [
          {
            name: "org.lwjgl:lwjgl-natives-windows:3.3.3",
            downloads: {
              artifact: {
                url: "https://libraries.minecraft.net/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar",
                sha1: "aa",
                size: 10,
              },
            },
            rules: [{ action: "allow", os: { name: "windows" } }],
          },
        ],
      },
      "patches/net.minecraft.json": {
        libraries: [],
        compatibleJavaMajors: [17],
        minecraftArguments:
          "--username ${auth_player_name} --session ${auth_session} --gameDir ${game_directory} --uuid ${auth_uuid}",
      },
      "patches/custom.jarmod.bta.json": { jarMods: [{ name: "x:bta:1" }] },
      "patches/net.fabricmc.fabric-loader.json": {
        mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
        libraries: [
          { name: "org.ow2.asm:asm:9.9", url: "https://maven.fabricmc.net/", sha1: "bb", size: 5 },
          {
            "MMC-hint": "local",
            name: "net.fabricmc.fabric-loader:fabric-loader:0.18.4-bta.11",
          },
        ],
      },
      "libraries/fabric-loader-0.18.4-bta.11.jar": Buffer.from("loader"),
    },
    prefix,
  );
  return target;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "bta-babric-"));
});

afterEach(async () => {
  await fs.remove(root);
});

describe("turnipInstanceUrls", () => {
  it("tries the current asset name first and the 7.3 one second", () => {
    expect(turnipInstanceUrls("v8.0.1")).toEqual([
      "https://github.com/Turnip-Labs/bta-fabric-instance-repo/releases/download/v8.0.1/bta_fabric_instance_8.0.1.zip",
      "https://github.com/Turnip-Labs/bta-fabric-instance-repo/releases/download/v8.0.1/bta_babric_instance_8.0.1.zip",
    ]);
  });
});

describe("instanceJvmProperties", () => {
  it("keeps only system properties from JvmArgs", () => {
    expect(
      instanceJvmProperties('X=1\nJvmArgs="-Djava.awt.headless=true -Xmx4G -XX:+UseG1GC"'),
    ).toEqual(["-Djava.awt.headless=true"]);
    expect(instanceJvmProperties("[General]")).toEqual([]);
  });
});

describe("readTurnipInstance", () => {
  it("turns the Prism patches into a launch layer", async () => {
    const layer = await readTurnipInstance(turnip801());

    expect(layer.loaderVersion).toBe("0.18.4-bta.11");
    expect(layer.mainClass).toBe("net.fabricmc.loader.impl.launch.knot.KnotClient");
    expect(layer.javaMajor).toBe(17);
    expect(layer.jvm).toEqual(["-Djava.awt.headless=true"]);
    expect(layer.minecraftArguments).toContain("--uuid ${auth_uuid}");
    expect(layer.libraries.map((library) => library.name)).toEqual([
      "org.lwjgl:lwjgl-natives-windows:3.3.3",
      "org.ow2.asm:asm:9.9",
      "net.fabricmc.fabric-loader:fabric-loader:0.18.4-bta.11",
    ]);
    expect(layer.libraries[0].downloads.artifact.path).toBe(
      "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar",
    );
    expect(layer.libraries[0].rules).toEqual([
      { action: "allow", os: { name: "windows" } },
    ]);
    expect(layer.localLibraries).toEqual([
      {
        path: "net/fabricmc/fabric-loader/fabric-loader/0.18.4-bta.11/fabric-loader-0.18.4-bta.11.jar",
        data: Buffer.from("loader"),
      },
    ]);
  });

  it("finds the instance inside one wrapping folder", async () => {
    const layer = await readTurnipInstance(turnip801("bta/"));
    expect(layer.loaderVersion).toBe("0.18.4-bta.11");
    expect(layer.localLibraries).toHaveLength(1);
  });

  it("refuses an archive without Fabric Loader", async () => {
    const target = path.join(root, "plain.zip");
    writeInstance(target, { "mmc-pack.json": { components: [{ uid: "net.minecraft" }] } });

    await expect(readTurnipInstance(target)).rejects.toThrow(/Fabric Loader/);
  });
});

describe("applyBabricLayer", () => {
  it("replaces the BTA launch setup with the Babric one", async () => {
    const layer = await readTurnipInstance(turnip801());
    const bta = {
      id: "v8.0.1",
      mainClass: "net.minecraft.launchwrapper.Launch",
      minecraftArguments: "${auth_player_name} ${auth_session}",
      javaVersion: { component: "jre-legacy", majorVersion: 8 },
      libraries: [{ name: "net.minecraft:launchwrapper:1.5" }],
      downloads: { client: { url: "https://bta/client.jar", sha1: "", size: 0 } },
    } as unknown as IVersionManifest;

    expect(hasBabricLayer(bta)).toBe(false);

    const applied = applyBabricLayer(bta, layer);
    expect(applied.id).toBe("v8.0.1");
    expect(applied.downloads.client.url).toBe("https://bta/client.jar");
    expect(applied.mainClass).toBe("net.fabricmc.loader.impl.launch.knot.KnotClient");
    expect(applied.javaVersion.majorVersion).toBe(17);
    expect(applied.arguments).toEqual({ game: [], jvm: ["-Djava.awt.headless=true"] });
    expect(applied.libraries.some((library) => library.name.includes("launchwrapper"))).toBe(
      false,
    );
    expect(hasBabricLayer(applied)).toBe(true);
  });
});
