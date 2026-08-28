import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const { TMP } = vi.hoisted(() => {
  const nodeOs = require("os");
  const nodePath = require("path");
  return {
    TMP: nodePath.join(
      nodeOs.tmpdir(),
      `grubie-aikeys-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ),
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => TMP },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString();
      if (!text.startsWith("enc:")) throw new Error("cannot decrypt");
      return text.slice(4);
    },
  },
}));

import { listProviders, saveProvider } from "./aiKeys";

const launcherDir = path.join(TMP, ".grubielauncher");
const secretsPath = path.join(launcherDir, "ai-providers.secrets.json");

beforeEach(async () => {
  await fs.remove(launcherDir);
});

afterAll(async () => {
  await fs.remove(TMP);
});

describe("aiKeys hasKey", () => {
  it("reports a key that decrypts", async () => {
    await saveProvider({
      label: "Provider",
      baseUrl: "https://example.test/api/v1",
      model: "some/model",
      apiKey: "sk-abcdef",
    });

    const state = await listProviders();

    expect(state.providers).toHaveLength(1);
    expect(state.providers[0].hasKey).toBe(true);
    expect(state.providers[0].keyHint).toBe("…cdef");
  });

  it("does not claim a key the launcher can no longer decrypt", async () => {
    await saveProvider({
      label: "Provider",
      baseUrl: "https://example.test/api/v1",
      model: "some/model",
      apiKey: "sk-abcdef",
    });

    const secrets = await fs.readJSON(secretsPath, "utf-8");
    for (const id of Object.keys(secrets)) {
      secrets[id] = {
        mode: "safeStorage",
        value: Buffer.from("written by another windows profile").toString(
          "base64",
        ),
      };
    }
    await fs.writeJSON(secretsPath, secrets);

    const state = await listProviders();

    expect(state.providers[0].hasKey).toBe(false);
  });
});
