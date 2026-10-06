import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs-extra";

const hoisted = vi.hoisted(() => ({ appData: "", downloads: [] as string[] }));

vi.mock("electron", () => ({
  app: {
    getPath: () => hoisted.appData,
    getVersion: () => "2.0.0",
    isReady: () => true,
    whenReady: async () => undefined,
    on: () => undefined,
  },
  shell: { trashItem: async () => undefined },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  createWindow: () => null,
}));

const RELEASES = "https://downloads.betterthanadventure.net/bta-client/release";

function btaManifest(id: string) {
  return {
    id,
    type: "old_beta",
    mainClass: "net.minecraft.launchwrapper.Launch",
    minecraftArguments: "${auth_player_name} ${auth_session} --gameDir ${game_directory} --assetsDir ${game_assets}",
    javaVersion: { component: "jre-legacy", majorVersion: 8 },
    assetIndex: {
      id: "pre-1.6",
      url: "https://launchermeta.mojang.com/v1/packages/pre-1.6.json",
      sha1: "",
      size: 0,
    },
    downloads: {
      client: { url: `${RELEASES}/${id}/client.jar`, sha1: "", size: 0 },
    },
    libraries: [],
  };
}

vi.mock("../utilities/downloader", () => ({
  waitWhileDownloadsPaused: async () => {},
  Downloader: class {
    public versionName = "";
    public onInfo: unknown = null;

    async downloadFiles(items: { url: string; destination: string }[]) {
      for (const item of items) {
        hoisted.downloads.push(item.url);
        await fs.ensureDir(path.dirname(item.destination));

        if (item.destination.replace(/\\/g, "/").includes("/assets/indexes/")) {
          await fs.writeJSON(item.destination, { objects: {} });
          continue;
        }

        const turnip = /bta-fabric-instance-repo\/releases\/download\/v([^/]+)\//.exec(
          item.url,
        );
        if (turnip) {
          const { default: AdmZip } = await import("adm-zip");
          const zip = new AdmZip();
          const loader = turnip[1] === "8.0.1" ? "0.18.4-bta.11" : "0.18.4-bta.10";
          zip.addFile(
            "mmc-pack.json",
            Buffer.from(
              JSON.stringify({
                components: [
                  { uid: "net.minecraft", version: "b1.7.3" },
                  { uid: "net.fabricmc.fabric-loader", version: loader },
                ],
              }),
            ),
          );
          zip.addFile(
            "patches/net.minecraft.json",
            Buffer.from(
              JSON.stringify({
                compatibleJavaMajors: [8],
                minecraftArguments: "--username ${auth_player_name} --session ${auth_session}",
              }),
            ),
          );
          zip.addFile(
            "patches/net.fabricmc.fabric-loader.json",
            Buffer.from(
              JSON.stringify({
                mainClass: "net.fabricmc.loader.impl.launch.knot.KnotClient",
                libraries: [
                  {
                    "MMC-hint": "local",
                    name: `net.fabricmc.fabric-loader:fabric-loader:${loader}`,
                  },
                ],
              }),
            ),
          );
          zip.addFile(`libraries/fabric-loader-${loader}.jar`, Buffer.from(loader));
          zip.writeZip(item.destination);
          continue;
        }

        const manifest = /\/release\/([^/]+)\/manifest\.json$/.exec(item.url);
        if (manifest) {
          await fs.writeJSON(item.destination, btaManifest(manifest[1]));
          continue;
        }

        await fs.writeFile(item.destination, item.url);
      }

      return null;
    }

    cancelDownload() {
      return undefined;
    }
  },
}));

import { Version } from "./Version";
import { changeLoaderVersion } from "./loaderChange";
import { IVersionConf } from "@/types/IVersion";
import { ILocalAccount } from "@/types/Account";
import { TSettings } from "@/types/Settings";

const account = { type: "plain", nickname: "Tester" } as unknown as ILocalAccount;
const settings = { downloadLimit: 6, lang: "en" } as unknown as TSettings;

let root = "";
let versionPath = "";

function build(id: string) {
  return { id, url: `${RELEASES}/${id}/manifest.json` };
}

function conf(id: string): IVersionConf {
  return {
    name: "BtaStand",
    version: {
      id: "b1.7.3",
      url: "https://piston-meta.mojang.com/v1/packages/b1.7.3.json",
      type: "old_beta",
    },
    loader: { name: "bta-babric", mods: [], version: build(id) },
  } as unknown as IVersionConf;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "gl-bta-"));
  hoisted.appData = root;
  hoisted.downloads = [];
  versionPath = path.join(root, ".grubielauncher", "minecraft", "versions", "BtaStand");

  const javaRoot = path.join(root, ".grubielauncher", "java", "jdk8u504-b01-jre");
  const binDir = path.join(
    javaRoot,
    process.platform === "darwin" ? path.join("Contents", "Home", "bin") : "bin",
  );
  await fs.ensureDir(binDir);
  for (const binary of process.platform === "win32" ? ["javaw.exe", "java.exe"] : ["java"]) {
    await fs.writeFile(path.join(binDir, binary), "");
  }
  await fs.writeFile(path.join(javaRoot, ".grubie-java-verified"), "");

  const version = new Version(conf("v8.0"));
  await version.init();
  await version.install(settings, account);
  await version.save();
});

afterEach(async () => {
  await fs.remove(root).catch(() => {});
});

describe("BTA instances", () => {
  it("install the BTA manifest and its client jar instead of Mojang's", async () => {
    const manifest = await fs.readJSON(path.join(versionPath, "b1.7.3.json"));

    expect(manifest.id).toBe("v8.0");
    expect(hoisted.downloads).not.toContain(
      "https://piston-meta.mojang.com/v1/packages/b1.7.3.json",
    );
    expect(await fs.readFile(path.join(versionPath, "b1.7.3.jar"), "utf-8")).toBe(
      `${RELEASES}/v8.0/client.jar`,
    );
    expect(manifest.mainClass).toBe("net.fabricmc.loader.impl.launch.knot.KnotClient");
    expect(manifest.minecraftArguments).toContain("--username");
    expect(
      await fs.readFile(
        path.join(
          root,
          ".grubielauncher",
          "minecraft",
          "libraries",
          "net/fabricmc/fabric-loader/fabric-loader/0.18.4-bta.10/fabric-loader-0.18.4-bta.10.jar",
        ),
        "utf-8",
      ),
    ).toBe("0.18.4-bta.10");
    expect(await fs.pathExists(path.join(versionPath, "bta-babric.zip"))).toBe(false);
  });

  it("swap the client jar together with the manifest on a version change", async () => {
    const next = await changeLoaderVersion({
      versionPath,
      conf: conf("v8.0"),
      build: build("v8.0.1"),
      settings,
      account,
      signal: new AbortController().signal,
    });

    expect(next.loader.version?.id).toBe("v8.0.1");
    expect((await fs.readJSON(path.join(versionPath, "b1.7.3.json"))).id).toBe(
      "v8.0.1",
    );
    expect(await fs.readFile(path.join(versionPath, "b1.7.3.jar"), "utf-8")).toBe(
      `${RELEASES}/v8.0.1/client.jar`,
    );
    expect(
      (await fs.readJSON(path.join(versionPath, "b1.7.3.json"))).libraries.map(
        (library: { name: string }) => library.name,
      ),
    ).toEqual(["net.fabricmc.fabric-loader:fabric-loader:0.18.4-bta.11"]);
  });
});
