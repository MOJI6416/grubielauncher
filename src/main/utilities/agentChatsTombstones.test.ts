import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const { TMP } = vi.hoisted(() => {
  const nodeOs = require("os");
  const nodePath = require("path");
  return {
    TMP: nodePath.join(
      nodeOs.tmpdir(),
      `grubie-agentchats-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ),
  };
});

vi.mock("electron", () => ({ app: { getPath: () => TMP } }));

import {
  addTombstone,
  forgetTombstone,
  listTombstones,
} from "./agentChats";

const agentDir = path.join(TMP, ".grubielauncher", "agent");

beforeEach(async () => {
  await fs.remove(agentDir);
});

afterAll(async () => {
  await fs.remove(TMP);
});

describe("agent chat tombstones", () => {
  it("starts empty when nothing was ever deleted", async () => {
    expect(await listTombstones()).toEqual([]);
  });

  it("remembers a remote id until the remote delete goes through", async () => {
    await addTombstone("remote-1");
    await addTombstone("remote-1");
    await addTombstone("remote-2");

    expect(await listTombstones()).toEqual(["remote-1", "remote-2"]);

    expect(await forgetTombstone("remote-1")).toBe(true);
    expect(await listTombstones()).toEqual(["remote-2"]);

    expect(await forgetTombstone("remote-1")).toBe(false);
  });

  it("ignores junk in the file instead of throwing", async () => {
    await fs.ensureDir(agentDir);
    await fs.writeJSON(path.join(agentDir, "deleted.json"), [
      "remote-1",
      42,
      null,
      "",
    ]);

    expect(await listTombstones()).toEqual(["remote-1"]);
  });
});
