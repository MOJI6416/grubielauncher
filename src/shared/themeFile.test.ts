import { describe, expect, it } from "vitest";
import type { ThemeDefinition } from "./themes";
import {
  backdropEntryName,
  decodeThemeCode,
  encodeThemeCode,
  themeFromManifest,
  themeManifest,
} from "./themeFile";

const theme: ThemeDefinition = {
  id: "custom-1",
  name: "Морская",
  mode: "dark",
  colors: { background: "#06141a", surface: "#0d2630", foreground: "#eef6ff", accent: "#ff7a45" },
  backdrop: {
    path: "C:/data/themes/backdrops/abc.jpeg",
    dim: 40,
    blur: 8,
    panelOpacity: 82,
    fit: "contain",
    focusX: 30,
    focusY: 70,
  },
};

describe("theme file", () => {
  it("round-trips through the manifest with a fresh id and the new picture path", () => {
    const manifest = themeManifest(theme);
    expect(manifest.backdrop?.file).toBe("backdrop.jpg");

    const restored = themeFromManifest(
      JSON.parse(JSON.stringify(manifest)),
      "custom-2",
      "C:/other/new.jpg",
    );
    expect(restored).toEqual({
      ...theme,
      id: "custom-2",
      backdrop: { ...theme.backdrop, path: "C:/other/new.jpg" },
    });
  });

  it("drops the picture when the archive had none", () => {
    expect(themeFromManifest(themeManifest(theme), "x", null)?.backdrop).toBeNull();
  });

  it("refuses files that are not Grubie themes", () => {
    expect(themeFromManifest({ name: "x", colors: theme.colors }, "x", null)).toBeNull();
    expect(themeFromManifest("nope", "x", null)).toBeNull();
  });

  it("names the picture entry by its type", () => {
    expect(backdropEntryName("a/b/c.PNG")).toBe("backdrop.png");
    expect(backdropEntryName("a/b/c.webp")).toBe("backdrop.webp");
  });
});

describe("theme code", () => {
  it("round-trips colours, mode and a non-latin name", () => {
    const code = encodeThemeCode(theme);
    expect(code.startsWith("grubie-theme:")).toBe(true);
    expect(code.length).toBeLessThan(160);

    expect(decodeThemeCode(code, "custom-3")).toEqual({
      ...theme,
      id: "custom-3",
      backdrop: null,
    });
  });

  it("finds the code inside a pasted message and keeps a missing accent empty", () => {
    const code = encodeThemeCode({ ...theme, mode: "light", colors: { ...theme.colors, accent: null } });
    const decoded = decodeThemeCode(`Лови тему: ${code} 🙂`, "y");
    expect(decoded?.mode).toBe("light");
    expect(decoded?.colors.accent).toBeNull();
  });

  it("carries panel colours", () => {
    const withTopBar = { ...theme, colors: { ...theme.colors, topbar: "#1d3a46" } };
    const decoded = decodeThemeCode(encodeThemeCode(withTopBar), "w");
    expect(decoded?.colors.topbar).toBe("#1d3a46");
    expect(decoded?.colors).not.toHaveProperty("sidebar");
  });

  it("rejects garbage", () => {
    expect(decodeThemeCode("grubie-theme:%%%", "z")).toBeNull();
    expect(decodeThemeCode("grubie-theme:e30", "z")).toBeNull();
    expect(decodeThemeCode("hello", "z")).toBeNull();
  });
});
