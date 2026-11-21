import { describe, expect, it } from "vitest";
import { componentKey, rewriteComponent } from "./components";

describe("rewriteComponent", () => {
  it("turns a plain line into a translatable one that falls back to it", () => {
    const { component, entries } = rewriteComponent("Welcome to the Aged Modpack!");
    const key = componentKey("Welcome to the Aged Modpack!");
    expect(component).toEqual({ translate: key, fallback: "Welcome to the Aged Modpack!" });
    expect(entries).toEqual({ [key]: "Welcome to the Aged Modpack!" });
  });

  it("keeps a styled sentence whole, with styled words as arguments", () => {
    const line = {
      text: "",
      extra: [
        "Pick up ",
        { text: "rocks", color: "gray" },
        " & ",
        { text: "flint", color: "gray" },
        " from the ground.",
      ],
    };
    const { component, entries } = rewriteComponent(line);
    const format = "Pick up %1$s & %2$s from the ground.";
    expect(component).toEqual({
      translate: componentKey(format),
      fallback: format,
      with: [
        { color: "gray", translate: componentKey("rocks"), fallback: "rocks" },
        { color: "gray", translate: componentKey("flint"), fallback: "flint" },
      ],
    });
    expect(Object.values(entries).sort()).toEqual([format, "flint", "rocks"].sort());
  });

  it("keeps style, click and hover of the line", () => {
    const { component } = rewriteComponent({
      text: "Join our Discord",
      color: "light_purple",
      clickEvent: { action: "open_url", value: "https://discord.gg/x" },
    });
    expect(component).toMatchObject({
      color: "light_purple",
      clickEvent: { action: "open_url", value: "https://discord.gg/x" },
      fallback: "Join our Discord",
    });
  });

  it("reads an array component and escapes percent signs", () => {
    const { component } = rewriteComponent(["", "Save 50% of your ", { text: "iron", bold: true }]);
    expect(component).toMatchObject({ fallback: "Save 50%% of your %1$s" });
  });

  it("leaves selectors, scores, keys and bare ids alone", () => {
    for (const value of [
      { selector: "@p" },
      { translate: "item.minecraft.stone" },
      { keybind: "key.jump" },
      "minecraft:stone",
      "",
    ]) {
      expect(rewriteComponent(value)).toEqual({ component: value, entries: {} });
    }
  });

  it("is idempotent and recovers the English from a rewritten component", () => {
    const first = rewriteComponent({ text: "", extra: ["Break ", { text: "leaves", color: "gray" }, " to get sticks."] });
    const second = rewriteComponent(first.component);
    expect(second.component).toEqual(first.component);
    expect(second.entries).toEqual(first.entries);
  });
});
