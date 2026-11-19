import { describe, expect, it } from "vitest";
import { Provider } from "@/types/ModManager";
import { archiveExtension, archiveProject, parseArchiveUrl } from "./archiveSource";

describe("parseArchiveUrl", () => {
  it("accepts http and https links and trims spaces", () => {
    expect(parseArchiveUrl("  https://example.org/pack.zip ")).toBe(
      "https://example.org/pack.zip",
    );
    expect(parseArchiveUrl("http://example.org/a b.mrpack")).toBe(
      "http://example.org/a%20b.mrpack",
    );
  });

  it("refuses anything that is not a web link", () => {
    expect(parseArchiveUrl("")).toBeNull();
    expect(parseArchiveUrl("example.org/pack.zip")).toBeNull();
    expect(parseArchiveUrl("file:///C:/pack.zip")).toBeNull();
    expect(parseArchiveUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("archiveExtension", () => {
  it("keeps .mrpack and treats everything else as zip", () => {
    expect(archiveExtension("https://e.org/files/Pack-1.2.MRPACK?x=1")).toBe(".mrpack");
    expect(archiveExtension("https://e.org/download?id=5")).toBe(".zip");
  });
});

describe("archiveProject", () => {
  it("describes an archive pack without a catalog page", () => {
    expect(archiveProject("Server Pack")).toMatchObject({
      title: "Server Pack",
      provider: Provider.LOCAL,
      id: "",
    });
  });
});
