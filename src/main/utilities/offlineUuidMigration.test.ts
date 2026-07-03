import os from "os";
import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.TEMP || "C:\\Temp"),
  },
}));

import {
  generateCanonicalOfflineUUID,
  generateOfflineUUID,
  toUUID,
} from "./other";
import {
  getOfflineUuidCandidates,
  planUuidFileCopies,
  resolveOfflineUuid,
} from "./offlineUuidMigration";

const tempRoots: string[] = [];

async function makeTempVersion() {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "grubie-uuid-migration-"),
  );
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((tempRoot) => fs.remove(tempRoot)));
});

describe("generateCanonicalOfflineUUID", () => {
  it("matches Java UUID.nameUUIDFromBytes bit layout", () => {
    for (const nick of ["Notch", "Steve", "грубик", "player_123", ""]) {
      const hash = createHash("md5")
        .update(`OfflinePlayer:${nick}`)
        .digest("hex");
      const uuid = generateCanonicalOfflineUUID(nick);

      expect(uuid).toHaveLength(32);
      expect(uuid[12]).toBe("3");
      expect(["8", "9", "a", "b"]).toContain(uuid[16]);
      expect(uuid.substring(0, 12)).toBe(hash.substring(0, 12));
      expect(uuid.substring(13, 16)).toBe(hash.substring(13, 16));
      expect(uuid.substring(17)).toBe(hash.substring(17));

      const expectedVariant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(
        16,
      );
      expect(uuid[16]).toBe(expectedVariant);
    }
  });

  it("differs from the legacy uuid only in the variant character", () => {
    const legacy = generateOfflineUUID("Steve");
    const canonical = generateCanonicalOfflineUUID("Steve");

    expect(legacy.substring(0, 16)).toBe(canonical.substring(0, 16));
    expect(legacy.substring(17)).toBe(canonical.substring(17));
  });
});

describe("planUuidFileCopies", () => {
  const oldUuid = "aaaaaaaaaaaa3aaa1aaaaaaaaaaaaaaa";
  const newUuid = "aaaaaaaaaaaa3aaa9aaaaaaaaaaaaaaa";
  const oldDashed = toUUID(oldUuid);
  const newDashed = toUUID(newUuid);

  it("plans copies for dashed uuid files with any extension", () => {
    const copies = planUuidFileCopies(
      [`${oldDashed}.dat`, `${oldDashed}.dat_old`, `${oldDashed}.json`],
      oldUuid,
      newUuid,
    );

    expect(copies).toEqual([
      { from: `${oldDashed}.dat`, to: `${newDashed}.dat` },
      { from: `${oldDashed}.dat_old`, to: `${newDashed}.dat_old` },
      { from: `${oldDashed}.json`, to: `${newDashed}.json` },
    ]);
  });

  it("handles undashed filenames and skips unrelated files", () => {
    const copies = planUuidFileCopies(
      [`${oldUuid}.dat`, "level.dat", "icon.png", "someone-else.json"],
      oldUuid,
      newUuid,
    );

    expect(copies).toEqual([{ from: `${oldUuid}.dat`, to: `${newUuid}.dat` }]);
  });

  it("never overwrites existing target files", () => {
    const copies = planUuidFileCopies(
      [`${oldDashed}.json`, `${newDashed}.json`],
      oldUuid,
      newUuid,
    );

    expect(copies).toEqual([]);
  });
});

describe("resolveOfflineUuid", () => {
  it("copies player files across world layouts and writes the marker", async () => {
    const versionPath = await makeTempVersion();
    const nickname = "Steve";
    const { legacy, canonical } = getOfflineUuidCandidates(nickname);
    expect(legacy).not.toBe(canonical);

    const legacyDashed = toUUID(legacy);
    const canonicalDashed = toUUID(canonical);
    const worldPath = path.join(versionPath, "saves", "My World");

    await fs.outputFile(
      path.join(worldPath, "playerdata", `${legacyDashed}.dat`),
      "playerdata",
    );
    await fs.outputFile(
      path.join(worldPath, "stats", `${legacyDashed}.json`),
      "{}",
    );
    await fs.outputFile(
      path.join(worldPath, "advancements", `${legacyDashed}.json`),
      "{}",
    );
    await fs.outputFile(
      path.join(worldPath, "players", "stats", `${legacyDashed}.json`),
      "{}",
    );
    await fs.outputFile(path.join(worldPath, "level.dat"), "level");

    const uuid = await resolveOfflineUuid(versionPath, nickname);

    expect(uuid).toBe(canonical);
    await expect(
      fs.pathExists(
        path.join(worldPath, "playerdata", `${canonicalDashed}.dat`),
      ),
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(path.join(worldPath, "stats", `${canonicalDashed}.json`)),
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(
        path.join(worldPath, "advancements", `${canonicalDashed}.json`),
      ),
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(
        path.join(worldPath, "players", "stats", `${canonicalDashed}.json`),
      ),
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(
        path.join(worldPath, "playerdata", `${legacyDashed}.dat`),
      ),
    ).resolves.toBe(true);

    const marker = await fs.readJSON(
      path.join(versionPath, "storage", "offline-uuid-migration.json"),
    );
    expect(marker.nicknames[nickname].uuid).toBe(canonical);
    expect(marker.nicknames[nickname].worlds["My World"]).toBeTypeOf("number");
  });

  it("is idempotent and does not clobber newer canonical files", async () => {
    const versionPath = await makeTempVersion();
    const nickname = "Steve";
    const { legacy, canonical } = getOfflineUuidCandidates(nickname);
    const legacyDashed = toUUID(legacy);
    const canonicalDashed = toUUID(canonical);
    const worldPath = path.join(versionPath, "saves", "World");

    await fs.outputFile(
      path.join(worldPath, "stats", `${legacyDashed}.json`),
      "old",
    );

    await resolveOfflineUuid(versionPath, nickname);

    await fs.writeFile(
      path.join(worldPath, "stats", `${canonicalDashed}.json`),
      "fresh progress",
    );

    const uuid = await resolveOfflineUuid(versionPath, nickname);

    expect(uuid).toBe(canonical);
    await expect(
      fs.readFile(
        path.join(worldPath, "stats", `${canonicalDashed}.json`),
        "utf-8",
      ),
    ).resolves.toBe("fresh progress");
  });

  it("migrates worlds added after the initial migration", async () => {
    const versionPath = await makeTempVersion();
    const nickname = "Steve";
    const { legacy, canonical } = getOfflineUuidCandidates(nickname);
    const legacyDashed = toUUID(legacy);
    const canonicalDashed = toUUID(canonical);

    await resolveOfflineUuid(versionPath, nickname);

    const newWorldPath = path.join(versionPath, "saves", "Later World");
    await fs.outputFile(
      path.join(newWorldPath, "playerdata", `${legacyDashed}.dat`),
      "playerdata",
    );

    const uuid = await resolveOfflineUuid(versionPath, nickname);

    expect(uuid).toBe(canonical);
    await expect(
      fs.pathExists(
        path.join(newWorldPath, "playerdata", `${canonicalDashed}.dat`),
      ),
    ).resolves.toBe(true);
  });
});
