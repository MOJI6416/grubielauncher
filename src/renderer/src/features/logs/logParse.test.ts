import { describe, expect, it } from "vitest";
import {
  collapseRepeats,
  entriesToText,
  entryText,
  guessLevel,
  isContinuation,
  mergeEntryLists,
  normalizeLevel,
  parseHead,
  parseLogText,
} from "./logParse";

describe("normalizeLevel", () => {
  it("maps launcher and java level names onto five levels", () => {
    expect(normalizeLevel("INFO")).toBe("info");
    expect(normalizeLevel("warn")).toBe("warn");
    expect(normalizeLevel("WARNING")).toBe("warn");
    expect(normalizeLevel("SEVERE")).toBe("fatal");
    expect(normalizeLevel("FINEST")).toBe("debug");
    expect(normalizeLevel("main")).toBeNull();
  });
});

describe("parseHead", () => {
  it("reads the vanilla and fabric prefix", () => {
    const head = parseHead("[23:26:51] [main/INFO]: Loading Minecraft 26.2");

    expect(head).toEqual({
      level: "info",
      time: "23:26:51",
      thread: "main",
      source: "",
      text: "Loading Minecraft 26.2",
    });
  });

  it("reads the neoforge prefix with a logger group", () => {
    const head = parseHead(
      "[15авг.2026 21:05:17.790] [main/INFO] [cpw.mods.modlauncher.Launcher/MODLAUNCHER]: JVM identified as Adoptium",
    );

    expect(head.level).toBe("info");
    expect(head.time).toBe("21:05:17");
    expect(head.thread).toBe("main");
    expect(head.source).toBe("Launcher");
    expect(head.text).toBe("JVM identified as Adoptium");
  });

  it("reads a bare level prefix", () => {
    expect(parseHead("[ERROR] boom")).toEqual({
      level: "error",
      time: "",
      thread: "",
      source: "",
      text: "boom",
    });
  });

  it("keeps unprefixed lines intact", () => {
    const head = parseHead("---- Minecraft Crash Report ----");

    expect(head.level).toBeNull();
    expect(head.text).toBe("---- Minecraft Crash Report ----");
  });

  it("does not eat message brackets", () => {
    const head = parseHead(
      "[21:05:17] [main/INFO]: ModLauncher running: args [--username, moji]",
    );

    expect(head.text).toBe("ModLauncher running: args [--username, moji]");
  });
});

describe("guessLevel", () => {
  it("promotes exception text to an error", () => {
    expect(guessLevel("java.lang.IllegalArgumentException: nope")).toBe("error");
    expect(guessLevel("Caused by: java.io.IOException")).toBe("error");
    expect(guessLevel("---- Minecraft Crash Report ----")).toBe("error");
  });

  it("leaves ordinary prose alone", () => {
    expect(guessLevel("Description: Argument parsing")).toBeNull();
    expect(guessLevel("Registered ErrorHandler for chunks")).toBeNull();
    expect(guessLevel("-- System Details --")).toBeNull();
  });
});

describe("isContinuation", () => {
  it("recognises stack trace shapes", () => {
    expect(isContinuation("\tat net.minecraft.Main.main(Main.java:1)")).toBe(true);
    expect(isContinuation("Caused by: java.lang.NullPointerException")).toBe(true);
    expect(isContinuation("... 12 more")).toBe(true);
    expect(isContinuation("\t- fabricloader 0.19.3")).toBe(true);
  });

  it("never swallows a prefixed line", () => {
    expect(isContinuation("[23:26:51] [main/INFO]: next")).toBe(false);
  });
});

describe("parseLogText", () => {
  const log = [
    "[23:26:51] [main/INFO]: Loading 2 mods:",
    "\t- fabricloader 0.19.3",
    "\t- sodium 0.9.2",
    "",
    "[23:26:52] [main/WARN]: Sodium applied a workaround",
    "[23:26:56] [Render thread/ERROR]: Argument parsing",
    "java.lang.IllegalArgumentException: Only one quick play option",
    "\tat net.minecraft.client.main.Main.main(Main.java:235)",
  ].join("\n");

  it("folds continuation lines into the entry above", () => {
    const entries = parseLogText(log);

    expect(entries).toHaveLength(3);
    expect(entries[0].extra).toEqual(["\t- fabricloader 0.19.3", "\t- sodium 0.9.2"]);
    expect(entries[1].level).toBe("warn");
    expect(entries[2].level).toBe("error");
  });

  it("attaches a bare exception line to the error above it", () => {
    const entries = parseLogText(log);

    expect(entries[2].text).toBe("Argument parsing");
    expect(entries[2].extra).toEqual([
      "java.lang.IllegalArgumentException: Only one quick play option",
      "\tat net.minecraft.client.main.Main.main(Main.java:235)",
    ]);
  });

  it("keeps unprefixed crash report lines separate", () => {
    const entries = parseLogText(
      [
        "---- Minecraft Crash Report ----",
        "Description: Argument parsing",
        "java.lang.IllegalArgumentException: boom",
        "\tat Main.main(Main.java:1)",
      ].join("\n"),
    );

    expect(entries).toHaveLength(3);
    expect(entries[2].extra).toEqual(["\tat Main.main(Main.java:1)"]);
  });

  it("keeps original line numbers after dropping blank lines", () => {
    const entries = parseLogText(log);

    expect(entries.map((entry) => entry.line)).toEqual([1, 5, 6]);
  });

  it("applies the fallback level to unprefixed output", () => {
    const entries = parseLogText("Game closed with code 1", "error");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
  });

  it("returns nothing for an empty log", () => {
    expect(parseLogText("")).toEqual([]);
    expect(parseLogText("\n\n  \n")).toEqual([]);
  });

  it("round-trips entry text", () => {
    const entries = parseLogText(log);

    expect(entryText(entries[0])).toBe(
      "[23:26:51] [main/INFO]: Loading 2 mods:\n\t- fabricloader 0.19.3\n\t- sodium 0.9.2",
    );
    expect(entriesToText(entries).split("\n")).toHaveLength(7);
  });
});

describe("collapseRepeats", () => {
  it("folds identical neighbours and counts them", () => {
    const collapsed = collapseRepeats(
      parseLogText(
        [
          "[10:00:01] [main/WARN]: Missing texture",
          "[10:00:02] [main/WARN]: Missing texture",
          "[10:00:03] [main/WARN]: Missing texture",
          "[10:00:04] [main/INFO]: Done",
        ].join("\n"),
      ),
    );

    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].repeat).toBe(3);
    expect(collapsed[1].repeat).toBe(1);
  });

  it("never folds lines that carry a stack trace", () => {
    const collapsed = collapseRepeats(
      parseLogText(
        [
          "[10:00:01] [main/ERROR]: Boom",
          "\tat Main.main(Main.java:1)",
          "[10:00:02] [main/ERROR]: Boom",
        ].join("\n"),
      ),
    );

    expect(collapsed).toHaveLength(2);
  });

  it("leaves the input untouched", () => {
    const entries = parseLogText(
      ["[10:00:01] [main/WARN]: x", "[10:00:02] [main/WARN]: x"].join("\n"),
    );
    collapseRepeats(entries);

    expect(entries[0].repeat).toBe(1);
  });
});

describe("mergeEntryLists", () => {
  it("renumbers ids and lines across sources", () => {
    const merged = mergeEntryLists([
      parseLogText("[23:26:51] [main/INFO]: one\n\tdetail"),
      parseLogText("Game closed with code 1", "error"),
    ]);

    expect(merged.map((entry) => entry.id)).toEqual([0, 1]);
    expect(merged.map((entry) => entry.line)).toEqual([1, 3]);
    expect(merged[1].level).toBe("error");
  });
});
