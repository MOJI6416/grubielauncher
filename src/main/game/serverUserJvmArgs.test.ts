import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs-extra";

vi.mock("electron", () => ({
  app: { on: vi.fn(), getPath: vi.fn(() => path.resolve("/fake/appdata")) },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  setRunningServersProbe: vi.fn(),
}));

import { writeUserJvmArgs } from "./Server";

const FORGE_TEMPLATE = [
  "# Xmx and Xms set the maximum and minimum RAM usage, respectively.",
  "# They can take any number, followed by an M or a G.",
  "# M means Megabyte, G means Gigabyte.",
  "# For example, to set the maximum to 3GB: -Xmx3G",
  "# To set the minimum to 2.5GB: -Xms2500M",
  "",
  "# A good default for a modded server is 4GB.",
  "# Uncomment the next line to set it.",
  "# -Xmx4G",
  "-XX:+UseG1GC",
  "",
].join("\n");

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "user-jvm-args-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.remove(dir);
});

describe("writeUserJvmArgs", () => {
  it("skips the loader's comment lines without reporting them as unsafe", async () => {
    const file = path.join(dir, "user_jvm_args.txt");
    await fs.writeFile(file, FORGE_TEMPLATE, "utf-8");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await writeUserJvmArgs(file, "-Xms1024M -Xmx4096M");

    expect(errors).not.toHaveBeenCalled();
    expect(await fs.readFile(file, "utf-8")).toBe(
      "-Xms1024M -Xmx4096M\n-XX:+UseG1GC",
    );
  });
});
