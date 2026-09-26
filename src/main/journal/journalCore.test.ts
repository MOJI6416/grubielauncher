import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JournalWriter,
  journalFileName,
  parseJournalFileName,
  sliceTailLines,
} from "./journalCore";
import type { JournalEntry } from "@/types/Journal";

const DAY = 24 * 60 * 60 * 1000;

function entry(t: number, m: string): JournalEntry {
  return { t, l: "info", src: "main", sid: "abcd", s: "test", m };
}

describe("journal file names", () => {
  it("round-trips day and part", () => {
    expect(journalFileName("2026-09-26", 0)).toBe("launcher-2026-09-26.jsonl");
    expect(journalFileName("2026-09-26", 3)).toBe("launcher-2026-09-26.3.jsonl");
    expect(parseJournalFileName("launcher-2026-09-26.3.jsonl")).toEqual({
      day: "2026-09-26",
      part: 3,
    });
    expect(parseJournalFileName("launcher-2026-09-26.jsonl")).toEqual({
      day: "2026-09-26",
      part: 0,
    });
    expect(parseJournalFileName("options.json")).toBeNull();
  });
});

describe("sliceTailLines", () => {
  it("drops the partial first line when cut", () => {
    const text = "first line\nsecond line\nthird\n";
    expect(sliceTailLines(text, 1000)).toEqual([
      "first line",
      "second line",
      "third",
    ]);
    expect(sliceTailLines(text, 14)).toEqual(["third"]);
  });
});

describe("JournalWriter", () => {
  let dir: string;
  let now: number;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "journal-"));
    now = Date.UTC(2026, 8, 26, 12, 0, 0);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appends lines to the file of the current day", async () => {
    const writer = new JournalWriter({ dir, now: () => now, flushDelayMs: 5 });
    writer.write(entry(now, "one"));
    writer.write(entry(now, "two"));
    await writer.flush();

    const text = fs.readFileSync(
      path.join(dir, "launcher-2026-09-26.jsonl"),
      "utf8",
    );
    expect(text.trim().split("\n").map((line) => JSON.parse(line).m)).toEqual([
      "one",
      "two",
    ]);
  });

  it("rolls over to a new part when the file is full", async () => {
    const writer = new JournalWriter({
      dir,
      now: () => now,
      maxFileBytes: 200,
    });
    for (let index = 0; index < 6; index += 1) {
      writer.write(entry(now, `message number ${index}`));
      await writer.flush();
    }

    const files = (await writer.listFiles()).map((file) => file.name);
    expect(files.length).toBeGreaterThan(1);
    expect(files[0]).toBe("launcher-2026-09-26.jsonl");
    expect(files[1]).toBe("launcher-2026-09-26.1.jsonl");
  });

  it("starts a new file on a new day", async () => {
    const writer = new JournalWriter({ dir, now: () => now });
    writer.write(entry(now, "today"));
    await writer.flush();
    now += DAY;
    writer.write(entry(now, "tomorrow"));
    await writer.flush();

    expect((await writer.listFiles()).map((file) => file.day)).toEqual([
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("reads the newest lines within the byte budget across files", async () => {
    const writer = new JournalWriter({ dir, now: () => now });
    writer.write(entry(now, "old day"));
    await writer.flush();
    now += DAY;
    writer.write(entry(now, "new day one"));
    writer.write(entry(now, "new day two"));

    const all = await writer.readTail({ maxBytes: 1024 * 1024 });
    expect(all.lines.map((line) => JSON.parse(line).m)).toEqual([
      "old day",
      "new day one",
      "new day two",
    ]);
    expect(all.truncated).toBe(false);

    const recentOnly = await writer.readTail({
      maxBytes: 1024 * 1024,
      sinceMs: now - 1000,
    });
    expect(recentOnly.lines.map((line) => JSON.parse(line).m)).toEqual([
      "new day one",
      "new day two",
    ]);
  });

  it("prunes files older than the retention window", async () => {
    fs.writeFileSync(path.join(dir, "launcher-2026-09-01.jsonl"), "{}\n");
    fs.writeFileSync(path.join(dir, "launcher-2026-09-25.jsonl"), "{}\n");
    fs.writeFileSync(path.join(dir, "options.json"), "{}");

    const writer = new JournalWriter({ dir, now: () => now, maxAgeDays: 10 });
    await writer.prune();

    expect(fs.readdirSync(dir).sort()).toEqual([
      "launcher-2026-09-25.jsonl",
      "options.json",
    ]);
  });

  it("keeps entries in memory when there is no folder", async () => {
    const writer = new JournalWriter({ dir: "" });
    writer.write(entry(now, "memory only"));

    const tail = await writer.readTail({ maxBytes: 1000 });
    expect(tail.lines.map((line) => JSON.parse(line).m)).toEqual([
      "memory only",
    ]);
  });
});
