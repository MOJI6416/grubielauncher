import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyFancyRewrite,
  fancyKey,
  readFancyEnglish,
  restoreFancy,
  rewriteLayout,
} from "./fancyMenu";

const LAYOUT = [
  "type = fancymenu_layout",
  "",
  "layout-meta {",
  "  identifier = pause_screen",
  "  is_enabled = true",
  "}",
  "",
  "element {",
  "  element_type = custom_button",
  "  description = Join us on Discord!",
  "  label = Discord",
  "  navigatable = true",
  "}",
  "",
  "element {",
  "  element_type = text_v2",
  "  source = Sharing your world has more latency.%n%Use 100% at your own risk, see [notes](click:open_notes).",
  "}",
  "",
  "element {",
  "  element_type = image",
  "  source = [source:local]/config/fancymenu/assets/logo.png",
  "}",
  "",
  "element {",
  "  element_type = text_v2",
  '  source = Mem: {"placeholder":"usedram"}/{"placeholder":"maxram"} MB',
  "  label = ",
  "}",
  "",
].join("\n");

describe("FancyMenu layouts", () => {
  it("swaps labels and text for local placeholders, escaping % for I18n", () => {
    const { text, english } = rewriteLayout(LAYOUT);
    expect(Object.values(english).sort()).toEqual(
      [
        "Discord",
        "Join us on Discord!",
        "Sharing your world has more latency.%%n%%Use 100%% at your own risk, see [notes](click:open_notes).",
      ].sort(),
    );
    expect(text).toContain(`  label = {"placeholder":"local","values":{"key":"${fancyKey("Discord")}"}}`);
    expect(text).toContain("  source = [source:local]/config/fancymenu/assets/logo.png");
    expect(text).toContain('  source = Mem: {"placeholder":"usedram"}/{"placeholder":"maxram"} MB');
    expect(text).toContain("  identifier = pause_screen");
    expect(rewriteLayout(text).english).toEqual({});
  });

  it("leaves files that are not FancyMenu 3 layouts alone", () => {
    expect(rewriteLayout("type = menu\nlabel = Old v2 layout\n").english).toEqual({});
  });
});

describe("rewriting an instance's layouts", () => {
  let instance: string;
  let storage: string;
  const file = () => path.join(instance, "config/fancymenu/customization/pause.txt");

  beforeAll(async () => {
    instance = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-fancy-"));
    storage = path.join(instance, "storage");
    await fs.outputFile(file(), LAYOUT, "utf8");
  });

  afterAll(async () => {
    await fs.remove(instance);
  });

  it("rewrites once, reads the English back from the original and restores it", async () => {
    const english = await readFancyEnglish(instance, storage, []);
    const rewritten = await applyFancyRewrite(instance, storage, []);
    expect(rewritten.map((entry) => entry.file)).toEqual(["pause.txt"]);
    expect(await readFancyEnglish(instance, storage, rewritten)).toEqual(english);
    expect(await applyFancyRewrite(instance, storage, rewritten)).toEqual(rewritten);
    await restoreFancy(instance, storage, rewritten);
    expect(await fs.readFile(file(), "utf8")).toBe(LAYOUT);
  });
});
