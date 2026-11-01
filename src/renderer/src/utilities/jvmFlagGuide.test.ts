import { describe, expect, it } from "vitest";
import { OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";
import en from "../../locales/en.json";
import { jvmFlagGroups, jvmFlagId, undescribedJvmFlags } from "./jvmFlagGuide";

const GUIDE = (en as { jvmFlags: { groups: object; flags: object } }).jvmFlags;

describe("jvm flag guide", () => {
  it("strips the -XX prefix, sign and value", () => {
    expect(jvmFlagId("-XX:+UseG1GC")).toBe("UseG1GC");
    expect(jvmFlagId("-XX:MaxGCPauseMillis=200")).toBe("MaxGCPauseMillis");
    expect(jvmFlagId("-XX:G1HeapRegionSize=8M")).toBe("G1HeapRegionSize");
  });

  it("puts every optimized flag into a named group", () => {
    expect(undescribedJvmFlags()).toEqual([]);
  });

  it("lists each optimized flag exactly once next to the heap note", () => {
    const notes = jvmFlagGroups().flatMap((group) => group.flags);
    expect(notes.map((note) => note.flag)).toEqual(
      expect.arrayContaining([...OPTIMIZED_GC_FLAGS]),
    );
    expect(notes).toHaveLength(OPTIMIZED_GC_FLAGS.length + 1);
  });

  it("has an English text for every group and flag", () => {
    for (const group of jvmFlagGroups()) {
      expect(GUIDE.groups).toHaveProperty(group.id);
      for (const note of group.flags) {
        expect(GUIDE.flags).toHaveProperty(note.id);
      }
    }
  });
});
