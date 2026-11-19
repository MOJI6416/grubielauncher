import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import fs from "fs-extra";
import { serialize, TagType, setPrototypeOf } from "@xmcl/nbt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IServer } from "@/types/ServersList";
import type { SharedInstanceRef } from "@/types/SharedSettings";

let root = "";

vi.mock("electron", () => ({ shell: {}, app: { getPath: () => root } }));
vi.mock("../../utilities/dataRoot", () => ({ getDataRoot: () => root }));
vi.mock("../../utilities/contentStore", () => ({
  copyContentFile: (source: string, target: string) => fs.copy(source, target),
}));

const { readNBT, writeNBT } = await import("../../utilities/nbt");
const { createZipArchive } = await import("../../utilities/archiver");
const sync = await import("./sync");
const { getOption, parseOptionsText } = await import("./optionsText");

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

function edit(text: string, changes: Record<string, string>): string {
  return text
    .split("\n")
    .map((line) => {
      const key = line.slice(0, line.indexOf(":"));
      return key in changes ? `${key}:${changes[key]}` : line;
    })
    .join("\n");
}

const server = (name: string, ip: string): IServer => ({
  name,
  ip,
  icon: "",
  acceptTextures: null,
  hidden: null,
});

async function hotbar(file: string, dataVersion: number) {
  const data = { DataVersion: dataVersion };
  setPrototypeOf(data, { DataVersion: TagType.Int } as never);
  await fs.outputFile(file, await serialize(data));
}

async function pack(file: string, format: number) {
  await createZipArchive([], file, undefined, 9, undefined, [
    {
      name: "pack.mcmeta",
      data: Buffer.from(
        JSON.stringify({ pack: { pack_format: format, description: "x" } }),
      ),
    },
  ]);
}

async function instance(
  name: string,
  mcVersion: string,
  options: string,
  servers: IServer[],
): Promise<SharedInstanceRef> {
  const versionPath = path.join(root, "minecraft", "versions", name);
  await fs.outputFile(path.join(versionPath, "options.txt"), options);
  await writeNBT(servers, path.join(versionPath, "servers.dat"));
  return { versionPath, mcVersion, loader: "vanilla" };
}

const read = (ref: SharedInstanceRef, key: string) =>
  getOption(
    parseOptionsText(
      readFileSync(path.join(ref.versionPath, "options.txt"), "utf8"),
    ),
    key,
  );

const servers = async (ref: SharedInstanceRef) =>
  (await readNBT(path.join(ref.versionPath, "servers.dat"))).map(
    (item) => item.name,
  );

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-shared-"));
});

afterEach(async () => {
  await fs.remove(root);
});

describe("shared game settings across a 1.20 and a 1.12 instance", () => {
  it("connects, shares a session's changes both ways and rolls back", async () => {
    const modern = await instance(
      "Modern",
      "1.20.1",
      edit(fixture("options-1.20.1.txt"), {
        "key_key.forward": "key.keyboard.z",
        fov: "0.5",
        resourcePacks: '["vanilla","file/Faithful.zip"]',
      }),
      [server("Hypixel", "mc.hypixel.net")],
    );
    await pack(
      path.join(modern.versionPath, "resourcepacks", "Faithful.zip"),
      15,
    );
    await hotbar(path.join(modern.versionPath, "hotbar.nbt"), 3465);
    await fs.outputFile(
      path.join(modern.versionPath, "command_history.txt"),
      "/time set day\n",
    );

    const legacy = await instance(
      "Legacy",
      "1.12.2",
      fixture("options-1.12.2.txt"),
      [server("Old friends", "old.example")],
    );

    const connected = await sync.configureShared(modern, {
      connected: true,
      off: [],
    });
    expect(connected).toMatchObject({
      connected: true,
      pending: false,
      hasBackup: true,
    });

    await sync.markNewInstance(legacy.versionPath);
    expect((await sync.sharedStatus(legacy)).pending).toBe(true);
    await sync.syncBeforeLaunch(legacy);

    expect(read(legacy, "key_key.forward")).toBe("44");
    expect(read(legacy, "fov")).toBe("0.5");
    expect(read(legacy, "version")).toBe("1343");
    expect(read(legacy, "resourcePacks")).toBe("[]");
    expect(await servers(legacy)).toEqual(["Hypixel", "Old friends"]);
    expect(
      await fs.pathExists(path.join(legacy.versionPath, "hotbar.nbt")),
    ).toBe(false);
    expect(
      readFileSync(
        path.join(legacy.versionPath, "command_history.txt"),
        "utf8",
      ),
    ).toBe("/time set day\n");

    const legacyOptions = path.join(legacy.versionPath, "options.txt");
    await fs.writeFile(
      legacyOptions,
      edit(readFileSync(legacyOptions, "utf8"), { "key_key.jump": "48" }),
    );
    await writeNBT(
      [
        server("Hypixel", "mc.hypixel.net"),
        server("Old friends", "old.example"),
        server("Mine", "mine.example"),
      ],
      path.join(legacy.versionPath, "servers.dat"),
    );
    await sync.captureAfterExit(legacy);

    await sync.syncBeforeLaunch(modern);
    expect(read(modern, "key_key.jump")).toBe("key.keyboard.b");
    expect(read(modern, "key_key.forward")).toBe("key.keyboard.z");
    expect(await servers(modern)).toEqual(["Hypixel", "Mine"]);
    expect(read(modern, "resourcePacks")).toBe(
      '["vanilla","file/Faithful.zip"]',
    );

    await sync.configureShared(legacy, { connected: true, off: ["controls"] });
    expect(read(legacy, "key_key.forward")).toBe("17");
    expect(read(legacy, "key_key.jump")).toBe("57");
    expect(read(legacy, "fov")).toBe("0.5");

    await sync.configureShared(modern, { connected: false, off: [] });
    expect(read(modern, "key_key.jump")).toBe("key.keyboard.space");
    expect(read(modern, "key_key.forward")).toBe("key.keyboard.z");
    expect(await servers(modern)).toEqual(["Hypixel"]);

    const overview = await sync.sharedOverview([
      modern.versionPath,
      legacy.versionPath,
    ]);
    expect(overview.connected).toEqual([legacy.versionPath]);
    expect(overview.profile).toMatchObject({
      packs: 1,
      hotbars: true,
      servers: 2,
    });
  });

  it("keeps the server list of a published build to its author", async () => {
    const shared = await instance(
      "Shared",
      "1.20.1",
      fixture("options-1.20.1.txt"),
      [server("Author server", "author.example")],
    );
    const ref = { ...shared, shareCode: "ABCD" };
    const status = await sync.configureShared(ref, {
      connected: true,
      off: [],
    });
    expect(status.blocked).toEqual({ servers: "share" });
    const profileServers = path.join(
      root,
      "shared-game-settings",
      "servers.dat",
    );
    expect(await fs.pathExists(profileServers)).toBe(false);
  });

  it("does not connect new instances when the player turned that off", async () => {
    await sync.setAutoConnect(false);
    const fresh = await instance("Fresh", "26.3", "", []);
    await sync.markNewInstance(fresh.versionPath);
    expect((await sync.sharedStatus(fresh)).connected).toBe(false);
  });
});
