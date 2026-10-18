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

import { listProviders, saveProvider, selectProvider } from "./aiKeys";

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
    const own = state.providers.filter((provider) => !provider.builtin);

    expect(own).toHaveLength(1);
    expect(own[0].hasKey).toBe(true);
    expect(own[0].keyHint).toBe("…cdef");
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

    expect(state.providers.find((provider) => !provider.builtin)?.hasKey).toBe(
      false,
    );
  });
});

describe("aiKeys built-in provider", () => {
  it("is listed first and selected when the player has no provider of their own", async () => {
    const state = await listProviders();

    expect(state.providers[0]).toMatchObject({ id: "grubie", builtin: true });
    expect(state.selectedId).toBe("grubie");
  });

  it("switches to a provider the player adds, and back on request", async () => {
    const saved = await saveProvider({
      label: "Provider",
      baseUrl: "https://example.test/api/v1",
      model: "some/model",
      apiKey: "sk-abcdef",
    });
    const own = saved.providers.find((provider) => !provider.builtin)!;
    expect(saved.selectedId).toBe(own.id);

    const back = await selectProvider("grubie");
    expect(back.selectedId).toBe("grubie");
    expect((await listProviders()).selectedId).toBe("grubie");
  });
});
