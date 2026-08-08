import { describe, expect, it } from "vitest";

import {
  classifyConsoleStream,
  createLineReader,
  mergeConsoleMessages,
  MAX_CONSOLE_LINE_LENGTH,
} from "./consoleLog";
import {
  recordConsoleOutput,
  getConsoleOutput,
  clearConsoleOutput,
} from "./consoleBuffer";

describe("console stream classifier", () => {
  it("treats authlib-injector INFO on stderr as info, not error", () => {
    expect(
      classifyConsoleStream(
        "[authlib-injector] [INFO] Authentication server: https://grubielauncher.com",
        "stderr",
      ),
    ).toBe("info");
  });

  it("treats Log4j INFO on stderr as info", () => {
    expect(
      classifyConsoleStream(
        "[15:04:05] [main/INFO]: Setting user: Steve",
        "stderr",
      ),
    ).toBe("info");
  });

  it("keeps tagged errors red regardless of stream", () => {
    expect(
      classifyConsoleStream("[15:04:05] [main/ERROR]: boom", "stdout"),
    ).toBe("error");
    expect(classifyConsoleStream("[FATAL] crash", "stderr")).toBe("error");
  });

  it("treats warnings as non-error", () => {
    expect(
      classifyConsoleStream("[12:00:00] [main/WARN]: deprecated", "stderr"),
    ).toBe("info");
  });

  it("falls back to the stream when no level tag is present", () => {
    expect(
      classifyConsoleStream('Exception in thread "main"', "stderr"),
    ).toBe("error");
    expect(classifyConsoleStream("plain progress line", "stdout")).toBe("info");
  });
});

describe("createLineReader", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, reader: createLineReader((line) => lines.push(line)) };
  };

  it("splits a chunk that carries several log lines", () => {
    const { lines, reader } = collect();

    reader.push(Buffer.from("first\nsecond\nthird\n"));

    expect(lines).toEqual(["first", "second", "third"]);
  });

  it("keeps an unfinished line until its remainder arrives", () => {
    const { lines, reader } = collect();

    reader.push(Buffer.from("Connecting to mc.exa"));
    expect(lines).toEqual([]);

    reader.push(Buffer.from("mple.com, 25565\n"));
    expect(lines).toEqual(["Connecting to mc.example.com, 25565"]);
  });

  it("does not corrupt multibyte characters split across chunks", () => {
    const { lines, reader } = collect();
    const utf8 = Buffer.from("Привет мир\n", "utf8");

    reader.push(utf8.subarray(0, 5));
    reader.push(utf8.subarray(5));

    expect(lines).toEqual(["Привет мир"]);
  });

  it("strips carriage returns and flushes the tail without a newline", () => {
    const { lines, reader } = collect();

    reader.push(Buffer.from("windows line\r\nno newline at end"));
    reader.flush();

    expect(lines).toEqual(["windows line", "no newline at end"]);
  });

  it("caps a single runaway line instead of buffering it forever", () => {
    const { lines, reader } = collect();

    reader.push(Buffer.from("x".repeat(MAX_CONSOLE_LINE_LENGTH * 2 + 10)));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(MAX_CONSOLE_LINE_LENGTH);
  });
});

describe("mergeConsoleMessages", () => {
  it("keeps batched lines separated by newlines", () => {
    const merged = mergeConsoleMessages([
      { type: "info", message: "first", tips: [] },
      { type: "info", message: "second", tips: [] },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].message).toBe("first\nsecond");
  });

  it("starts a new message when the type changes", () => {
    const merged = mergeConsoleMessages([
      { type: "info", message: "info line", tips: [] },
      { type: "error", message: "error line", tips: [] },
      { type: "error", message: "another error", tips: [] },
    ]);

    expect(merged.map((message) => message.message)).toEqual([
      "info line",
      "error line\nanother error",
    ]);
  });

  it("does not mutate the incoming messages", () => {
    const batch = [
      { type: "info" as const, message: "a", tips: [] },
      { type: "info" as const, message: "b", tips: [] },
    ];

    mergeConsoleMessages(batch);

    expect(batch[0].message).toBe("a");
  });

  it("lets the crash buffer keep every line of a long batch", () => {
    clearConsoleOutput("Merged 1.20.1", 0);

    const batch = Array.from({ length: 3 }, (_, index) => ({
      type: "info" as const,
      message: `${"y".repeat(1500)} line ${index}`,
      tips: [],
    }));

    for (const message of mergeConsoleMessages(batch)) {
      recordConsoleOutput("Merged 1.20.1", 0, message.message);
    }

    expect(getConsoleOutput("Merged 1.20.1", 0).split("\n")).toHaveLength(3);

    clearConsoleOutput("Merged 1.20.1", 0);
  });
});
