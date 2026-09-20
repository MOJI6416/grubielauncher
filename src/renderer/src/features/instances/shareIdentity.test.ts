import { describe, expect, it, vi } from "vitest";
import type { IModpack } from "@/types/Backend";
import type { Version } from "@renderer/classes/Version";
import {
  adoptCanonicalShareCode,
  findInstanceForPack,
  instanceMatchesPack,
  packIdentityKeys,
} from "./shareIdentity";

const ROW_ID = "5542ae5dca494f7f8aa910f7";
const SHARE_CODE = "6d012725072387148fdf0f7a";

function pack(overrides: Partial<IModpack> = {}): IModpack {
  return {
    _id: ROW_ID,
    shareCode: SHARE_CODE,
    build: 1,
    downloads: 0,
    createdAt: new Date(),
    lastUpdate: new Date(),
    conf: {} as IModpack["conf"],
    ...overrides,
  } as IModpack;
}

function instance(shareCode: string | undefined) {
  const version = { shareCode, name: "pack" };
  return {
    version,
    save: vi.fn().mockResolvedValue(true),
  } as unknown as Version & { save: ReturnType<typeof vi.fn> };
}

describe("packIdentityKeys", () => {
  it("names the share code first and the row id as the legacy key", () => {
    expect(packIdentityKeys(pack())).toEqual([SHARE_CODE, ROW_ID]);
  });

  it("collapses to one key for builds published before share codes existed", () => {
    expect(packIdentityKeys(pack({ shareCode: null }))).toEqual([ROW_ID]);
  });
});

describe("instanceMatchesPack", () => {
  it("recognises an instance written before the fix, by row id", () => {
    expect(instanceMatchesPack(ROW_ID, pack())).toBe(true);
  });

  it("recognises an instance written by the author, by share code", () => {
    expect(instanceMatchesPack(SHARE_CODE, pack())).toBe(true);
  });

  it("does not match a different build", () => {
    expect(instanceMatchesPack("0".repeat(24), pack())).toBe(false);
    expect(instanceMatchesPack(undefined, pack())).toBe(false);
  });
});

describe("findInstanceForPack", () => {
  it("finds the host's build even though the guest stored the row id", () => {
    const guest = instance(ROW_ID);

    expect(findInstanceForPack([instance("other"), guest], pack())).toBe(guest);
  });

  it("prefers the instance keyed by the canonical code", () => {
    const legacy = instance(ROW_ID);
    const canonical = instance(SHARE_CODE);

    expect(findInstanceForPack([legacy, canonical], pack())).toBe(canonical);
  });
});

describe("adoptCanonicalShareCode", () => {
  it("rewrites a row id into the share code and saves", async () => {
    const target = instance(ROW_ID);

    expect(await adoptCanonicalShareCode(target, pack())).toBe(true);
    expect(target.version.shareCode).toBe(SHARE_CODE);
    expect(target.save).toHaveBeenCalledTimes(1);
  });

  it("leaves an already canonical instance alone", async () => {
    const target = instance(SHARE_CODE);

    expect(await adoptCanonicalShareCode(target, pack())).toBe(false);
    expect(target.save).not.toHaveBeenCalled();
  });

  it("never rewrites an instance that belongs to another build", async () => {
    const target = instance("0".repeat(24));

    expect(await adoptCanonicalShareCode(target, pack())).toBe(false);
    expect(target.version.shareCode).toBe("0".repeat(24));
    expect(target.save).not.toHaveBeenCalled();
  });

  it("does nothing for a build that has no share code", async () => {
    const target = instance(ROW_ID);

    expect(
      await adoptCanonicalShareCode(target, pack({ shareCode: null })),
    ).toBe(false);
    expect(target.save).not.toHaveBeenCalled();
  });
});
