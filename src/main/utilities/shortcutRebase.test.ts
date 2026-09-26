import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";

const { state } = vi.hoisted(() => ({
  state: {
    desktop: "",
    links: {} as Record<string, { icon?: string; iconIndex?: number }>,
    writes: [] as { file: string; icon?: string }[],
  },
}));

vi.mock("electron", () => ({
  app: { getPath: () => state.desktop },
  nativeImage: {},
  shell: {
    readShortcutLink: (file: string) => {
      const link = state.links[path.basename(file)];
      if (!link) throw new Error("not a shortcut");
      return link;
    },
    writeShortcutLink: (
      file: string,
      _operation: string,
      options: { icon?: string },
    ) => {
      state.writes.push({ file: path.basename(file), icon: options.icon });
      return true;
    },
  },
}));

import { rebaseShortcutIcons } from "./shortcut";

const from = path.resolve("/data/old/.grubielauncher");
const to = path.resolve("/data/new/GrubieLauncher");

beforeEach(async () => {
  state.desktop = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-desktop-"));
  state.links = {};
  state.writes = [];
});

afterEach(async () => {
  await fs.remove(state.desktop);
});

describe.runIf(process.platform === "win32")("rebaseShortcutIcons", () => {
  it("points launcher shortcut icons at the moved data folder only", async () => {
    for (const name of [
      "Survival.lnk",
      "Other.lnk",
      "Broken.lnk",
      "notes.txt",
    ]) {
      await fs.writeFile(path.join(state.desktop, name), "");
    }
    state.links["Survival.lnk"] = {
      icon: path.join(from, "shortcuts", "Survival.ico"),
      iconIndex: 0,
    };
    state.links["Other.lnk"] = {
      icon: path.resolve("/Program Files/App/app.ico"),
    };

    await expect(rebaseShortcutIcons(from, to)).resolves.toBe(1);
    expect(state.writes).toEqual([
      {
        file: "Survival.lnk",
        icon: path.join(to, "shortcuts", "Survival.ico"),
      },
    ]);
  });
});
