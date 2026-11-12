import { describe, expect, it } from "vitest";
import {
  galleryThemeToDefinition,
  normalizeGalleryTheme,
  normalizePublishedTheme,
  publishPayload,
} from "./themeGallery";
import { normalizeTheme } from "./themes";

const RAW = {
  id: "64f0000000000000000000aa",
  name: "Закат",
  mode: "dark",
  colors: { background: "#140D12", surface: "#22161e", foreground: "#f6eef2", accent: "#ff7a45" },
  backdrop: {
    dim: 55,
    blur: 6,
    panelOpacity: 88,
    url: "https://cdn.example/themes/a/backdrop.webp",
    thumbUrl: "https://cdn.example/themes/a/thumb.webp",
  },
  authorName: "Lumavia",
  downloads: 12,
};

describe("normalizeGalleryTheme", () => {
  it("keeps a well-formed theme", () => {
    expect(normalizeGalleryTheme(RAW)).toMatchObject({
      id: RAW.id,
      colors: { background: "#140d12" },
      backdrop: { dim: 55, thumbUrl: RAW.backdrop.thumbUrl },
      authorName: "Lumavia",
    });
  });

  it("refuses ids and colours that did not come from the gallery", () => {
    expect(normalizeGalleryTheme({ ...RAW, id: "../../etc" })).toBeNull();
    expect(
      normalizeGalleryTheme({ ...RAW, colors: { ...RAW.colors, foreground: "red" } }),
    ).toBeNull();
  });

  it("drops a picture that is not served over https", () => {
    const theme = normalizeGalleryTheme({
      ...RAW,
      backdrop: { ...RAW.backdrop, url: "file:///C:/Windows/win.ini" },
    });
    expect(theme?.backdrop).toBeNull();
  });

  it("reads the author's own status and reason", () => {
    expect(
      normalizePublishedTheme({ ...RAW, status: "rejected", rejectionReason: "Копия" }),
    ).toMatchObject({ status: "rejected", rejectionReason: "Копия" });
    expect(normalizePublishedTheme({ ...RAW, status: "weird" })?.status).toBe("pending");
  });
});

describe("galleryThemeToDefinition", () => {
  it("remembers where the theme came from and where its picture lives", () => {
    const item = normalizeGalleryTheme(RAW)!;
    const theme = galleryThemeToDefinition(item, "custom-1", "C:/data/themes/backdrops/x.webp");

    expect(theme).toMatchObject({
      id: "custom-1",
      galleryId: RAW.id,
      backdrop: { path: "C:/data/themes/backdrops/x.webp", dim: 55, blur: 6, panelOpacity: 88 },
    });
    expect(normalizeTheme(theme)?.galleryId).toBe(RAW.id);
  });

  it("publishes colours and picture settings, never the local path", () => {
    const theme = galleryThemeToDefinition(normalizeGalleryTheme(RAW)!, "custom-1", "C:/x.webp")!;
    const payload = publishPayload(theme);

    expect(payload.backdrop).toEqual({
      dim: 55,
      blur: 6,
      panelOpacity: 88,
      fit: "cover",
      focusX: 50,
      focusY: 50,
    });
    expect(JSON.stringify(payload)).not.toContain("C:/x.webp");
  });

  it("carries the picture placement and panel colours both ways", () => {
    const raw = {
      ...RAW,
      colors: { ...RAW.colors, sidebar: "#2A1B4D", topbar: "nope" },
      backdrop: { ...RAW.backdrop, fit: "contain", focusX: 20, focusY: 80 },
    };
    const item = normalizeGalleryTheme(raw)!;
    expect(item.colors.sidebar).toBe("#2a1b4d");
    expect(item.colors).not.toHaveProperty("topbar");

    const theme = galleryThemeToDefinition(item, "custom-2", "C:/y.webp")!;
    expect(theme.backdrop).toMatchObject({ fit: "contain", focusX: 20, focusY: 80 });
    expect(publishPayload(theme)).toMatchObject({
      colors: { sidebar: "#2a1b4d" },
      backdrop: { fit: "contain", focusX: 20, focusY: 80 },
    });
  });

  it("reads a theme published before placement existed as filling the window", () => {
    expect(normalizeGalleryTheme(RAW)?.backdrop).toMatchObject({
      fit: "cover",
      focusX: 50,
      focusY: 50,
    });
  });
});
