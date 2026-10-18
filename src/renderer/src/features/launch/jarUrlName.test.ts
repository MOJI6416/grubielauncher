import { describe, expect, it, vi } from "vitest";

vi.mock("@renderer/i18n", () => ({
  default: { t: (key: string) => key, language: "en", resolvedLanguage: "en" },
}));

vi.mock("@renderer/features/instances/openInstanceScreen", () => ({
  openInstanceScreen: vi.fn(),
}));

const { breaksJarUrlName, jarUrlSafeName, resolvesRealJarPaths } = await import(
  "./jarUrlName"
);

describe("jar URL safe instance names", () => {
  it("knows which loaders resolve jar paths to their real folder", () => {
    for (const loader of ["fabric", "quilt", "legacy-fabric", "babric", "ornithe", "bta-babric"]) {
      expect(resolvesRealJarPaths(loader)).toBe(true);
    }
    for (const loader of ["vanilla", "forge", "neoforge", undefined]) {
      expect(resolvesRealJarPaths(loader)).toBe(false);
    }
  });

  it("flags only a trailing exclamation mark", () => {
    expect(breaksJarUrlName("Better than Adventure!")).toBe(true);
    expect(breaksJarUrlName("Better than Adventure! (Managed)")).toBe(false);
    expect(breaksJarUrlName("Minecraft Cocoa")).toBe(false);
  });

  it("suggests the name without the trailing marks", () => {
    expect(jarUrlSafeName("Better than Adventure!")).toBe("Better than Adventure");
    expect(jarUrlSafeName("Wow !!!")).toBe("Wow");
  });
});
