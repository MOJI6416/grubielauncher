import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SharedGroup } from "@/types/SharedSettings";
import type { Loader } from "@/types/Loader";
import {
  applySharedOptions,
  captureSharedOptions,
  optionsBaseline,
  restoreOptions,
  type ProfileOptions,
} from "./optionsMerge";
import { getOption, parseOptionsText } from "./optionsText";
import { optionsEra } from "./catalog";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const V1_12 = fixture("options-1.12.2.txt");
const V1_20 = fixture("options-1.20.1.txt");
const V26 = fixture("options-26.3.txt");

const BOTH = new Set<SharedGroup>(["controls", "video"]);
const NOW = 1_700_000_000_000;

function target(
  mcVersion: string,
  loader: Loader = "vanilla",
  groups: ReadonlySet<SharedGroup> = BOTH,
  dataVersion: number | null = null,
) {
  return { mcVersion, loader, groups, dataVersion };
}

function value(text: string, key: string) {
  return getOption(parseOptionsText(text), key);
}

function edit(text: string, changes: Record<string, string>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return text
    .split(/\r?\n/)
    .map((line) => {
      const key = line.slice(0, line.indexOf(":"));
      return key in changes ? `${key}:${changes[key]}` : line;
    })
    .join(eol);
}

function sessionCapture(
  text: string,
  changes: Record<string, string>,
  mcVersion: string,
  profile: ProfileOptions = {},
  loader: Loader = "vanilla",
): ProfileOptions {
  const baseline = optionsBaseline(text, BOTH);
  return captureSharedOptions(
    edit(text, changes),
    baseline,
    profile,
    target(mcVersion, loader),
    "session",
    NOW,
  );
}

describe("optionsEra", () => {
  it("splits versions by how options.txt stores values", () => {
    expect(optionsEra("1.12.2")).toBe("legacy");
    expect(optionsEra("b1.7.3")).toBe("legacy");
    expect(optionsEra("1.13")).toBe("flat");
    expect(optionsEra("1.18.2")).toBe("flat");
    expect(optionsEra("1.20.1")).toBe("modern");
    expect(optionsEra("26.3")).toBe("modern");
    expect(optionsEra("1.20.1-pre1")).toBe("modern");
    expect(optionsEra("24w14a")).toBeNull();
  });
});

describe("from 1.20 to 1.12", () => {
  const profile = sessionCapture(
    V1_20,
    {
      "key_key.forward": "key.keyboard.z",
      "key_key.attack": "key.mouse.4",
      "key_key.swapOffhand": "key.keyboard.g",
      "key_key.emi.toggle_visibility": "key.keyboard.k",
      fov: "0.25",
      graphicsMode: "0",
      ao: "false",
      renderClouds: '"fast"',
      soundCategory_music: "0.3",
      renderDistance: "32",
      lang: "en_us",
    },
    "1.20.1",
  );

  it("captures only the keys the player changed in shared groups", () => {
    expect(Object.keys(profile).sort()).toEqual(
      [
        "ao",
        "fov",
        "graphicsMode",
        "key_key.attack",
        "key_key.emi.toggle_visibility",
        "key_key.forward",
        "key_key.swapOffhand",
        "renderClouds",
        "soundCategory_music",
      ].sort(),
    );
    expect(profile.renderClouds.value).toBe("fast");
    expect(profile.ao.value).toBe("0");
    expect(profile["key_key.forward"]).toMatchObject({
      value: "key.keyboard.z",
      mc: "1.20.1",
    });
  });

  it("writes them into 1.12 in the 1.12 format and keeps everything else", () => {
    const result = applySharedOptions(
      V1_12,
      profile,
      target("1.12.2", "forge"),
    );
    expect(result.changed).toBe(true);
    const text = result.text;

    expect(value(text, "key_key.forward")).toBe("44");
    expect(value(text, "key_key.attack")).toBe("-97");
    expect(value(text, "key_key.swapHands")).toBe("34");
    expect(value(text, "key_key.swapOffhand")).toBeUndefined();
    expect(value(text, "fancyGraphics")).toBe("false");
    expect(value(text, "graphicsMode")).toBeUndefined();
    expect(value(text, "ao")).toBe("0");
    expect(value(text, "renderClouds")).toBe("fast");
    expect(value(text, "fov")).toBe("0.25");
    expect(value(text, "soundCategory_music")).toBe("0.3");
    expect(value(text, "key_key.emi.toggle_visibility")).toBe("37");

    expect(value(text, "version")).toBe("1343");
    expect(value(text, "renderDistance")).toBe("12");
    expect(value(text, "lang")).toBe("ru_ru");
    expect(value(text, "key_key.jei.toggleOverlay")).toBe("24");
    expect(value(text, "key_of.key.zoom")).toBe("46");
    expect(value(text, "modelPart_hat")).toBe("true");
    expect(value(text, "chatHeightUnfocused")).toBe("0.44366196");

    const before = V1_12.split("\n").length;
    expect(text.split("\n").length).toBe(before + 1);
  });

  it("does not report the game's own rewrite as a change", () => {
    const applied = applySharedOptions(
      V1_12,
      profile,
      target("1.12.2", "forge"),
    );
    const again = captureSharedOptions(
      applied.text,
      applied.baseline,
      profile,
      target("1.12.2", "forge"),
      "session",
      NOW + 1,
    );
    expect(again).toEqual({});
  });
});

describe("from 1.12 to 1.20 and 26.x", () => {
  const profile = sessionCapture(
    V1_12,
    {
      "key_key.forward": "44",
      "key_key.sneak": "42:SHIFT",
      "key_key.swapHands": "34",
      fancyGraphics: "false",
      ao: "1",
      renderClouds: "false",
      soundCategory_master: "0.5",
      mouseSensitivity: "0.75",
      gamma: "1.0",
      "key_of.key.zoom": "47",
      mipmapLevels: "0",
    },
    "1.12.2",
    {},
    "forge",
  );

  it("stores keys by their modern names", () => {
    expect(profile["key_key.forward"].value).toBe("key.keyboard.z");
    expect(profile["key_key.sneak"].value).toBe(
      "key.keyboard.left.shift:SHIFT",
    );
    expect(profile["key_key.swapOffhand"].value).toBe("key.keyboard.g");
    expect(profile.graphicsMode.value).toBe("0");
    expect(profile["key_of.key.zoom"]).toBeUndefined();
    expect(profile.mipmapLevels).toBeUndefined();
  });

  it("converts them for 1.20", () => {
    const { text } = applySharedOptions(V1_20, profile, target("1.20.1"));
    expect(value(text, "key_key.forward")).toBe("key.keyboard.z");
    expect(value(text, "key_key.swapOffhand")).toBe("key.keyboard.g");
    expect(value(text, "key_key.sneak")).toBe("key.keyboard.left.shift");
    expect(value(text, "graphicsMode")).toBe("0");
    expect(value(text, "ao")).toBe("true");
    expect(value(text, "renderClouds")).toBe('"false"');
    expect(value(text, "soundCategory_master")).toBe("0.5");
    expect(value(text, "mouseSensitivity")).toBe("0.75");
    expect(value(text, "gamma")).toBe("1.0");
    expect(value(text, "mipmapLevels")).toBe("4");
    expect(value(text, "version")).toBe("3465");
  });

  it("keeps a Forge modifier only where the loader reads it", () => {
    const neo = applySharedOptions(
      V1_20,
      profile,
      target("1.20.1", "neoforge"),
    );
    expect(value(neo.text, "key_key.sneak")).toBe(
      "key.keyboard.left.shift:SHIFT",
    );
    const legacy = applySharedOptions(
      V1_12,
      profile,
      target("1.12.2", "vanilla"),
    );
    expect(value(legacy.text, "key_key.sneak")).toBe("42");
  });

  it("writes into a real 26.3 file without touching per-instance keys", () => {
    const result = applySharedOptions(V26, profile, target("26.3"));
    const text = result.text;
    expect(value(text, "key_key.forward")).toBe("key.keyboard.z");
    expect(value(text, "renderClouds")).toBe('"false"');
    expect(value(text, "ao")).toBe("true");
    expect(value(text, "graphicsMode")).toBeUndefined();
    expect(value(text, "graphicsPreset")).toBe('"custom"');
    expect(value(text, "preferredGraphicsBackend")).toBe('"default"');
    expect(value(text, "startedCleanly")).toBe("true");
    expect(value(text, "renderDistance")).toBe("12");
    expect(value(text, "lang")).toBe("ru_ru");
    expect(value(text, "version")).toBe("5023");
    expect(text.includes("\r\n")).toBe(V26.includes("\r\n"));
    expect(text.split(/\r?\n/).length).toBe(V26.split(/\r?\n/).length);
  });
});

describe("26.x back to 1.20 and 1.12", () => {
  const profile = sessionCapture(
    V26,
    {
      "key_key.quickActions": "key.keyboard.h",
      "key_key.jump": "key.keyboard.right.alt",
      graphicsPreset: '"fancy"',
      inactivityFpsLimit: '"minimized"',
      preferredGraphicsBackend: '"vulkan"',
      startedCleanly: "false",
      toggleAttack: "true",
      guiScale: "4",
    },
    "26.3",
  );

  it("never takes the render backend or crash markers", () => {
    expect(profile.preferredGraphicsBackend).toBeUndefined();
    expect(profile.startedCleanly).toBeUndefined();
    expect(profile.graphicsPreset.value).toBe("fancy");
  });

  it("skips options an older game does not have", () => {
    const { text } = applySharedOptions(V1_20, profile, target("1.20.1"));
    expect(value(text, "graphicsPreset")).toBeUndefined();
    expect(value(text, "inactivityFpsLimit")).toBeUndefined();
    expect(value(text, "toggleAttack")).toBeUndefined();
    expect(value(text, "key_key.jump")).toBe("key.keyboard.right.alt");
    expect(value(text, "key_key.quickActions")).toBe("key.keyboard.h");
    expect(value(text, "guiScale")).toBe("4");
  });

  it("maps keys to LWJGL2 codes for 1.12", () => {
    const { text } = applySharedOptions(V1_12, profile, target("1.12.2"));
    expect(value(text, "key_key.jump")).toBe("184");
  });
});

describe("a new instance", () => {
  const profile: ProfileOptions = {
    "key_key.forward": { value: "key.keyboard.z", at: NOW, mc: "1.20.1" },
    fov: { value: "0.5", at: NOW, mc: "1.20.1" },
    renderClouds: { value: "fast", at: NOW, mc: "1.12.2" },
  };

  it("writes the data version before modern key names", () => {
    const { text } = applySharedOptions(
      "lang:ru_ru",
      profile,
      target("1.20.1", "fabric", BOTH, 3465),
    );
    const doc = parseOptionsText(text);
    expect(doc.lines[0]).toEqual({ key: "version", value: "3465" });
    expect(value(text, "key_key.forward")).toBe("key.keyboard.z");
    expect(value(text, "renderClouds")).toBe('"fast"');
    expect(value(text, "lang")).toBe("ru_ru");
  });

  it("leaves key names out when the data version is unknown", () => {
    const { text } = applySharedOptions(
      null,
      profile,
      target("1.20.1", "fabric", BOTH, null),
    );
    expect(value(text, "key_key.forward")).toBeUndefined();
    expect(value(text, "version")).toBeUndefined();
    expect(value(text, "fov")).toBe("0.5");
  });

  it("needs no data version for 1.12 codes", () => {
    const { text } = applySharedOptions(null, profile, target("1.12.2"));
    expect(value(text, "key_key.forward")).toBe("44");
    expect(value(text, "version")).toBeUndefined();
  });

  it("leaves snapshots alone", () => {
    const result = applySharedOptions(V1_20, profile, target("24w14a"));
    expect(result.changed).toBe(false);
    expect(result.text).toBe(V1_20);
  });
});

describe("which value wins", () => {
  it("takes from a first session only what differs from vanilla", () => {
    const updates = captureSharedOptions(
      edit(V1_20, {
        "key_key.forward": "key.keyboard.z",
        "key_key.emi.toggle_visibility": "key.keyboard.k",
      }),
      {},
      {},
      target("1.20.1"),
      "session",
      NOW,
    );
    expect(Object.keys(updates)).toEqual(["key_key.forward"]);
  });

  it("fills keys from an adopted instance without replacing shared ones", () => {
    const profile: ProfileOptions = {
      "key_key.jump": { value: "key.keyboard.j", at: 1, mc: "26.3" },
    };
    const own = edit(V1_12, {
      "key_key.forward": "44",
      "key_key.jump": "48",
      "key_key.jei.toggleOverlay": "25",
    });
    const updates = captureSharedOptions(
      own,
      null,
      profile,
      target("1.12.2"),
      "adopt",
      NOW,
    );
    expect(updates["key_key.forward"].value).toBe("key.keyboard.z");
    expect(updates["key_key.jei.toggleOverlay"].value).toBe("key.keyboard.p");
    expect(updates["key_key.jump"]).toBeUndefined();
    expect(updates["key_key.back"]).toBeUndefined();
  });

  it("knows that 1.12 and new versions start from different defaults", () => {
    const plain = captureSharedOptions(
      V1_12,
      null,
      {},
      target("1.12.2"),
      "adopt",
      NOW,
    );
    expect(plain.gamma).toBeUndefined();
    expect(plain.autoJump).toBeUndefined();

    const bright = captureSharedOptions(
      edit(V1_12, { gamma: "1.0", autoJump: "false" }),
      null,
      {},
      target("1.12.2"),
      "adopt",
      NOW,
    );
    expect(bright.gamma.value).toBe("1.0");
    expect(bright.autoJump.value).toBe("false");
  });

  it("does not overwrite a shared value it never applied", () => {
    const profile: ProfileOptions = {
      graphicsPreset: { value: "fancy", at: 1, mc: "26.3" },
    };
    const updates = captureSharedOptions(
      V26,
      {},
      profile,
      target("26.3"),
      "session",
      NOW,
    );
    expect(updates.graphicsPreset).toBeUndefined();
  });

  it("only touches enabled groups", () => {
    const controls = new Set<SharedGroup>(["controls"]);
    const updates = captureSharedOptions(
      edit(V1_20, { fov: "1.0", "key_key.drop": "key.keyboard.y" }),
      optionsBaseline(V1_20, controls),
      {},
      target("1.20.1", "vanilla", controls),
      "session",
      NOW,
    );
    expect(Object.keys(updates)).toEqual(["key_key.drop"]);
  });
});

describe("restoreOptions", () => {
  it("puts back the instance's own values for the switched-off group only", () => {
    const shared = edit(V1_20, {
      "key_key.forward": "key.keyboard.z",
      fov: "0.5",
    });
    const result = restoreOptions(shared, V1_20, new Set(["controls"]));
    expect(value(result.text, "key_key.forward")).toBe("key.keyboard.w");
    expect(value(result.text, "fov")).toBe("0.5");
  });

  it("keeps keys the backup never had", () => {
    const shared = `${V1_20}key_key.newmod.open:key.keyboard.n\n`;
    const result = restoreOptions(shared, V1_20, new Set(["controls"]));
    expect(value(result.text, "key_key.newmod.open")).toBe("key.keyboard.n");
  });
});

describe("file shape", () => {
  it("keeps the BOM and Windows line ends", () => {
    const source = `\uFEFFversion:3465\r\nfov:0.0\r\nlang:ru_ru\r\n`;
    const { text } = applySharedOptions(
      source,
      { fov: { value: "0.5", at: NOW, mc: "1.20.1" } },
      target("1.20.1"),
    );
    expect(text).toBe(`\uFEFFversion:3465\r\nfov:0.5\r\nlang:ru_ru\r\n`);
  });
});
