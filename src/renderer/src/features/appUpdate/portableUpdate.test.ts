import { describe, expect, it } from "vitest";
import { pickPortableUpdate, portableDownloadUrl } from "./portableUpdate";

describe("pickPortableUpdate", () => {
  it("offers a newer release", () => {
    expect(pickPortableUpdate("2.2.6", "2.3.0", undefined)).toBe("2.3.0");
  });

  it("stays quiet on the same or an older release", () => {
    expect(pickPortableUpdate("2.3.0", "2.3.0", undefined)).toBeNull();
    expect(pickPortableUpdate("2.3.1", "2.3.0", undefined)).toBeNull();
  });

  it("does not repeat a version the player closed", () => {
    expect(pickPortableUpdate("2.2.6", "2.3.0", "2.3.0")).toBeNull();
  });

  it("speaks up again when a later version comes out", () => {
    expect(pickPortableUpdate("2.2.6", "2.3.1", "2.3.0")).toBe("2.3.1");
  });

  it("needs both versions", () => {
    expect(pickPortableUpdate("", "2.3.0", undefined)).toBeNull();
    expect(pickPortableUpdate("2.2.6", null, undefined)).toBeNull();
  });
});

describe("portableDownloadUrl", () => {
  it("opens the download page in the player's language", () => {
    expect(portableDownloadUrl("ru")).toBe("https://grubielauncher.com/ru/download");
    expect(portableDownloadUrl("pt-BR")).toBe("https://grubielauncher.com/pt/download");
  });

  it("falls back to English for a language the site lacks", () => {
    expect(portableDownloadUrl("ja")).toBe("https://grubielauncher.com/en/download");
    expect(portableDownloadUrl(undefined)).toBe("https://grubielauncher.com/en/download");
  });
});
