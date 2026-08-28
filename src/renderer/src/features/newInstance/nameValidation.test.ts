import { describe, expect, it } from "vitest";
import {
  checkInstanceName,
  sanitizeInstanceName,
  suggestInstanceName,
} from "./nameValidation";

describe("checkInstanceName", () => {
  it("accepts a plain unused name", () => {
    expect(checkInstanceName("Fabric 1.21.4", ["Vanilla 1.21"])).toEqual({
      ok: true,
      issue: null,
      characters: [],
      suggestion: "",
    });
  });

  it("reports an empty name", () => {
    expect(checkInstanceName("   ", []).issue).toBe("empty");
  });

  it("reports the exact forbidden characters", () => {
    const result = checkInstanceName("my/pack:1", []);

    expect(result.issue).toBe("forbidden");
    expect(result.characters).toEqual(["/", ":"]);
    expect(result.suggestion).toBe("mypack1");
  });

  it("rejects emoji the java command line cannot carry", () => {
    const result = checkInstanceName("ZZ Сборка 🎮 ЫЫЫ", []);

    expect(result.issue).toBe("emoji");
    expect(result.characters).toEqual(["🎮"]);
    expect(result.suggestion).toBe("ZZ Сборка ЫЫЫ");
  });

  it("keeps letters, digits and typographic signs", () => {
    expect(checkInstanceName("Сборка «мечты» 2.0 ©", []).ok).toBe(true);
  });

  it("reports control characters separately", () => {
    expect(checkInstanceName("pack\nname", []).issue).toBe("control");
  });

  it("rejects a dots-only name", () => {
    expect(checkInstanceName("..", []).issue).toBe("dots");
    expect(checkInstanceName("my..pack", []).ok).toBe(true);
  });

  it("rejects a trailing dot or space the main process would refuse", () => {
    expect(checkInstanceName("pack.", []).issue).toBe("trailing");
    expect(checkInstanceName("pack .", []).issue).toBe("trailing");
    expect(checkInstanceName("pack ", []).ok).toBe(true);
  });

  it("rejects windows reserved names", () => {
    expect(checkInstanceName("CON", []).issue).toBe("reserved");
    expect(checkInstanceName("NUL.txt", []).issue).toBe("reserved");
    expect(checkInstanceName("console", []).ok).toBe(true);
  });

  it("separates too long from taken", () => {
    expect(checkInstanceName("a".repeat(33), []).issue).toBe("tooLong");
    expect(checkInstanceName("Pack", ["pack"]).issue).toBe("taken");
  });

  it("suggests a free name when the name is taken", () => {
    expect(checkInstanceName("Pack", ["pack"]).suggestion).toBe("Pack (2)");
  });

  it("does not suggest anything when nothing can be fixed", () => {
    expect(checkInstanceName("...", []).suggestion).toBe("");
  });
});

describe("sanitizeInstanceName", () => {
  it("strips path characters, control characters and trailing dots", () => {
    expect(sanitizeInstanceName('a<b>c:"d/e\\f|g?h*i')).toBe("abcdefghi");
    expect(sanitizeInstanceName("pack\tname")).toBe("packname");
    expect(sanitizeInstanceName("pack...")).toBe("pack");
  });

  it("collapses whitespace and cuts to the limit", () => {
    expect(sanitizeInstanceName("  All   The   Mods  ")).toBe("All The Mods");
    expect(sanitizeInstanceName("b".repeat(40))).toHaveLength(32);
  });

  it("gives up on reserved names", () => {
    expect(sanitizeInstanceName("aux")).toBe("");
  });
});

describe("suggestInstanceName", () => {
  it("keeps the base name when it is free", () => {
    expect(suggestInstanceName("Fabric 1.21", [])).toBe("Fabric 1.21");
  });

  it("adds a counter when the base name is taken", () => {
    expect(suggestInstanceName("Fabric 1.21", ["Fabric 1.21"])).toBe(
      "Fabric 1.21 (2)",
    );
  });
});

describe("checkInstanceName with folders on disk", () => {
  it("refuses a name whose folder exists outside the library", () => {
    const check = checkInstanceName("Старая сборка", [], ["Старая сборка"]);

    expect(check.ok).toBe(false);
    expect(check.issue).toBe("folderTaken");
  });

  it("ignores case when matching folders", () => {
    expect(checkInstanceName("fresh pack", [], ["Fresh Pack"]).issue).toBe(
      "folderTaken",
    );
  });

  it("suggests a name free of both instances and folders", () => {
    const check = checkInstanceName("Fabric 1.21", ["Fabric 1.21"], [
      "Fabric 1.21 (2)",
    ]);

    expect(check.suggestion).toBe("Fabric 1.21 (3)");
  });

  it("stays valid when the folder list is empty", () => {
    expect(checkInstanceName("Fabric 1.21", [], []).ok).toBe(true);
  });
});
