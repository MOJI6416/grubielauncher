import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  contrastReport,
  findTheme,
  isThemeReadable,
  mixHex,
  normalizeTheme,
  normalizeThemesFile,
  textOn,
  themeVariables,
  titleBarColors,
  visibleAccent,
  zonePalette,
  zoneVariables,
  type ThemeDefinition,
} from "./themes";
import { contrastRatio } from "./accents";
import { TITLEBAR_OVERLAY } from "./titlebar";

const VIOLET = "#7c5cff";

const custom = (patch: Partial<ThemeDefinition> = {}): ThemeDefinition => ({
  id: "mine",
  name: "Mine",
  mode: "dark",
  colors: { background: "#101418", surface: "#1a2128", foreground: "#eef2f6", accent: null },
  backdrop: null,
  ...patch,
});

describe("themeVariables", () => {
  it("leaves the Grubie theme exactly as the stylesheet draws it", () => {
    expect(themeVariables(findTheme(DEFAULT_THEME_ID, []), VIOLET)).toEqual({});
  });

  it("derives every surface and text token from the base colours", () => {
    const vars = themeVariables(custom(), VIOLET);
    expect(vars["--background"]).toBe("#101418");
    expect(vars["--surface-2"]).toBe("#1a2128");
    expect(vars["--foreground"]).toBe("#eef2f6");
    expect(vars["--primary"]).toBe(VIOLET);
    expect(vars["--border"]).toMatch(/^rgb\(238 242 246 \/ 9%\)$/);
  });

  it("makes panels see-through over a background picture but keeps popovers solid", () => {
    const vars = themeVariables(
      custom({
        backdrop: {
          path: "C:/bg.png",
          dim: 50,
          blur: 4,
          panelOpacity: 80,
          fit: "cover",
          focusX: 50,
          focusY: 50,
        },
      }),
      VIOLET,
    );
    expect(vars["--card"]).toMatch(/\/ 80%\)$/);
    expect(vars["--popover"]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("switches semantic colours to darker shades on a light theme", () => {
    const vars = themeVariables(findTheme("light", []), VIOLET);
    expect(vars["--success"]).toBe("oklch(0.52 0.13 158)");
    expect(vars["--grain-opacity"]).toBe("0.025");
  });

  it("brightens secondary text in high contrast mode", () => {
    const normal = themeVariables(custom(), VIOLET)["--muted-foreground"];
    const high = themeVariables(custom(), VIOLET, true)["--muted-foreground"];
    expect(high).not.toBe(normal);
  });

  it("uses the theme's own accent when it has one", () => {
    const vars = themeVariables(
      custom({ colors: { ...custom().colors, accent: "#22b8cf" } }),
      VIOLET,
    );
    expect(vars["--primary"]).toBe("#22b8cf");
    expect(vars["--primary-foreground"]).toBe("#111316");
  });
});

describe("visibleAccent", () => {
  it("darkens a pale accent on a light theme so it stays visible", () => {
    const light = findTheme("light", []);
    expect(visibleAccent("#e4e4e7", light.colors, "light")).not.toBe("#e4e4e7");
    expect(visibleAccent(VIOLET, light.colors, "light")).toBe(VIOLET);
  });
});

describe("contrastReport", () => {
  it("passes every built-in theme with every accent", () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const accent of [VIOLET, "#3d6eff", "#22b8cf", "#d13d8a", "#e4e4e7"]) {
        expect(isThemeReadable(theme, accent), `${theme.id} ${accent}`).toBe(true);
      }
    }
  });

  it("fails text that blends into the panels", () => {
    const unreadable = custom({
      colors: { background: "#202020", surface: "#2a2a2a", foreground: "#3a3a3a", accent: null },
    });
    const report = contrastReport(unreadable, VIOLET);
    expect(report.find((check) => check.id === "text")?.level).toBe("fail");
    expect(isThemeReadable(unreadable, VIOLET)).toBe(false);
  });
});

describe("theme gallery origin", () => {
  it("keeps a gallery id and drops anything else in its place", () => {
    const base = {
      id: "custom-1",
      name: "x",
      colors: { background: "#000000", surface: "#111111", foreground: "#ffffff" },
    };
    expect(normalizeTheme({ ...base, galleryId: "64f0000000000000000000aa" })?.galleryId).toBe(
      "64f0000000000000000000aa",
    );
    expect(normalizeTheme({ ...base, galleryId: "../x" })).not.toHaveProperty("galleryId");
    expect(normalizeTheme(base)).not.toHaveProperty("galleryId");
  });
});

describe("normalizeThemesFile", () => {
  it("keeps valid user themes and drops junk, duplicates and built-in ids", () => {
    const file = normalizeThemesFile({
      themes: [
        custom(),
        custom(),
        { ...custom(), id: "oled" },
        { ...custom(), id: "bad", colors: { background: "red" } },
        { ...custom(), id: "long", name: "x".repeat(80), mode: "neon" },
      ],
    });
    expect(file.themes.map((theme) => theme.id)).toEqual(["mine", "long"]);
    expect(file.themes[1].name).toHaveLength(40);
    expect(file.themes[1].mode).toBe("dark");
  });

  it("clamps background picture settings", () => {
    const file = normalizeThemesFile({
      themes: [
        {
          ...custom(),
          backdrop: { path: "a.png", dim: 400, blur: -3, panelOpacity: 10, focusX: 140, focusY: -5 },
        },
      ],
    });
    expect(file.themes[0].backdrop).toEqual({
      path: "a.png",
      dim: 90,
      blur: 0,
      panelOpacity: 70,
      fit: "cover",
      focusX: 100,
      focusY: 0,
    });
  });

  it("keeps a known picture fit and drops an unknown one", () => {
    const backdrop = { path: "a.png", dim: 40, blur: 0, panelOpacity: 90 };
    const fitOf = (fit: unknown) =>
      normalizeThemesFile({ themes: [{ ...custom(), backdrop: { ...backdrop, fit } }] }).themes[0]
        .backdrop?.fit;
    expect(fitOf("contain")).toBe("contain");
    expect(fitOf("stretch")).toBe("stretch");
    expect(fitOf("tile")).toBe("cover");
  });

  it("keeps valid panel colours and drops broken ones", () => {
    const theme = normalizeTheme({
      ...custom(),
      colors: { ...custom().colors, sidebar: "#2A1B4D", topbar: "red" },
    });
    expect(theme?.colors.sidebar).toBe("#2a1b4d");
    expect(theme?.colors).not.toHaveProperty("topbar");
  });
});

describe("panel colours", () => {
  it("changes nothing for a theme without its own panel colours", () => {
    expect(zoneVariables(custom(), "sidebar", VIOLET)).toBeNull();
    expect(zonePalette(custom(), "topbar", VIOLET)).toBeNull();
    expect(contrastReport(custom(), VIOLET).map((check) => check.id)).not.toContain("sidebar");
  });

  it("paints the sidebar in its own colour and picks readable text for it", () => {
    const theme = custom({ colors: { ...custom().colors, sidebar: "#f2e6c9" } });
    const vars = zoneVariables(theme, "sidebar", VIOLET)!;
    expect(vars["--sidebar"]).toBe("#f2e6c9");
    expect(contrastRatio(vars["--foreground"], "#f2e6c9")).toBeGreaterThanOrEqual(4.5);
    expect(vars["--primary-soft"]).toContain("var(--primary)");
    expect(contrastReport(theme, VIOLET).find((check) => check.id === "sidebar")?.level).toBe("ok");
  });

  it("keeps the theme text when it already reads on the panel", () => {
    const theme = custom({ colors: { ...custom().colors, topbar: "#0a0d10" } });
    expect(zonePalette(theme, "topbar", VIOLET)?.foreground).toBe("#eef2f6");
  });

  it("makes the sidebar see-through over a picture like the other panels", () => {
    const theme = custom({
      colors: { ...custom().colors, sidebar: "#2a1b4d", topbar: "#2a1b4d" },
      backdrop: {
        path: "a.png",
        dim: 40,
        blur: 0,
        panelOpacity: 80,
        fit: "cover",
        focusX: 50,
        focusY: 50,
      },
    });
    expect(zoneVariables(theme, "sidebar", VIOLET)?.["--sidebar"]).toMatch(/\/ 80%\)$/);
    expect(zoneVariables(theme, "topbar", VIOLET)?.["--background"]).toBe("#2a1b4d");
  });

  it("blocks a mid-tone panel whose secondary text cannot be read", () => {
    const theme = custom({ colors: { ...custom().colors, sidebar: "#ce28c8" } });
    expect(contrastReport(theme, VIOLET).find((check) => check.id === "sidebar")?.level).toBe(
      "fail",
    );
    expect(isThemeReadable(theme, VIOLET)).toBe(false);
  });

  it("ignores panel colours on the built-in Grubie theme", () => {
    const grubie = { ...findTheme(DEFAULT_THEME_ID, []) };
    grubie.colors = { ...grubie.colors, sidebar: "#ff0000" };
    expect(zoneVariables(grubie, "sidebar", VIOLET)).toBeNull();
  });
});

describe("titleBarColors", () => {
  it("keeps the window buttons of Grubie exactly as before", () => {
    expect(titleBarColors(findTheme(DEFAULT_THEME_ID, []))).toEqual({
      color: TITLEBAR_OVERLAY.color,
      symbolColor: TITLEBAR_OVERLAY.symbolColor,
    });
  });

  it("follows the top bar of a light theme and of a theme with its own top bar", () => {
    const light = titleBarColors(findTheme("light", []));
    expect(light.color).toBe("#eceef2");
    expect(contrastRatio(light.symbolColor, light.color)).toBeGreaterThan(3);
    expect(titleBarColors(custom({ colors: { ...custom().colors, topbar: "#123456" } })).color).toBe(
      "#123456",
    );
  });
});

describe("helpers", () => {
  it("mixes colours and picks readable text", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(textOn("#ffffff")).toBe("#111316");
    expect(textOn("#000000")).toBe("#fcfcfc");
  });

  it("falls back to Grubie for an unknown theme", () => {
    expect(findTheme("gone", []).id).toBe(DEFAULT_THEME_ID);
  });
});
