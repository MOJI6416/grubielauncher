import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ root: "", answer: null as unknown, calls: 0 }));

vi.mock("./dataRoot", () => ({ getDataRoot: () => fake.root }));
vi.mock("../services/Backend", () => ({
  Backend: class {
    async getAuthlib() {
      fake.calls++;
      return fake.answer;
    }
  },
}));

const GITHUB = {
  name: "com.github.yushijinhun:authlib-injector:1.2.8",
  url: "https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.8/authlib-injector-1.2.8.jar",
  path: "com/github/yushijinhun/authlib-injector/1.2.8/authlib-injector-1.2.8.jar",
  sha1: "b".repeat(40),
  size: 10,
  version: "1.2.8",
};
const CDN = {
  ...GITHUB,
  url: "https://cdn.grubielauncher.com/libs/authlib-injector/1.2.8/authlib-injector-1.2.8.jar",
};

fake.root = fs.mkdtempSync(path.join(os.tmpdir(), "grubie-authlib-"));

afterAll(async () => {
  await fs.remove(fake.root);
});

beforeEach(() => {
  vi.resetModules();
  fake.calls = 0;
});

describe("syncAuthlibLibrary", () => {
  it("adds the library, moves an old GitHub address to the CDN and leaves a current one alone", async () => {
    const { syncAuthlibLibrary } = await import("./authlib");
    const manifest = { libraries: [] as never[] } as unknown as Parameters<typeof syncAuthlibLibrary>[0];

    expect(syncAuthlibLibrary(manifest, GITHUB)).toBe(true);
    expect(manifest.libraries[0].downloads.artifact.url).toBe(GITHUB.url);
    expect(syncAuthlibLibrary(manifest, CDN)).toBe(true);
    expect(manifest.libraries).toHaveLength(1);
    expect(manifest.libraries[0].downloads.artifact).toEqual({
      url: CDN.url,
      path: CDN.path,
      size: CDN.size,
      sha1: CDN.sha1,
    });
    expect(syncAuthlibLibrary(manifest, CDN)).toBe(false);
  });
});

describe("getAuthlibCached", () => {
  it("asks the api before using a cached GitHub address", async () => {
    await fs.outputJSON(path.join(fake.root, "cache", "authlib.json"), GITHUB);
    fake.answer = CDN;
    const { getAuthlibCached } = await import("./authlib");

    expect((await getAuthlibCached())?.url).toBe(CDN.url);
    expect((await fs.readJSON(path.join(fake.root, "cache", "authlib.json"))).url).toBe(CDN.url);
  });

  it("uses a cached CDN address at once and keeps the cache when the api is down", async () => {
    await fs.outputJSON(path.join(fake.root, "cache", "authlib.json"), CDN);
    fake.answer = null;
    const { getAuthlibCached } = await import("./authlib");

    expect((await getAuthlibCached())?.url).toBe(CDN.url);
    expect((await getAuthlibCached())?.url).toBe(CDN.url);
    expect(fake.calls).toBe(1);
  });

  it("falls back to the cached GitHub address when the api has no answer", async () => {
    await fs.outputJSON(path.join(fake.root, "cache", "authlib.json"), GITHUB);
    fake.answer = null;
    const { getAuthlibCached } = await import("./authlib");

    expect((await getAuthlibCached())?.url).toBe(GITHUB.url);
  });
});
