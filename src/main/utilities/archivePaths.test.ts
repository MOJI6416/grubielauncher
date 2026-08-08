import path from "path";
import { describe, expect, it } from "vitest";
import { getSafeExtractPath, getSafeLinkExtractPath } from "./archivePaths";

const root = path.resolve("/tmp/extract-root");

describe("getSafeLinkExtractPath", () => {
  it("accepts a relative symlink pointing to a sibling directory", () => {
    const target = getSafeLinkExtractPath(
      root,
      "jdk-25.0.4+7-jre/legal/java.se/LICENSE",
      "../java.base/LICENSE",
      true,
    );

    expect(target).toBe(
      path.resolve(root, "jdk-25.0.4+7-jre/legal/java.base/LICENSE"),
    );
  });

  it("resolves hard links against the archive root", () => {
    const target = getSafeLinkExtractPath(
      root,
      "jre/bin/keytool",
      "jre/bin/java",
      false,
    );

    expect(target).toBe(path.resolve(root, "jre/bin/java"));
  });

  it("rejects a symlink escaping the destination", () => {
    expect(() =>
      getSafeLinkExtractPath(root, "jre/bin/java", "../../../etc/passwd", true),
    ).toThrow(/traversal|escape/);
  });

  it("rejects absolute link targets", () => {
    expect(() =>
      getSafeLinkExtractPath(root, "jre/bin/java", "/etc/passwd", true),
    ).toThrow(/absolute/);

    expect(() =>
      getSafeLinkExtractPath(root, "jre/bin/java", "C:/Windows/system32", true),
    ).toThrow(/absolute/);
  });

  it("rejects an empty link target", () => {
    expect(() => getSafeLinkExtractPath(root, "jre/bin/java", "", true)).toThrow(
      /Invalid tar linkpath/,
    );
  });
});

describe("getSafeExtractPath", () => {
  it("keeps rejecting traversal in entry names", () => {
    expect(() => getSafeExtractPath(root, "../evil")).toThrow(/traversal/);
  });
});
