import { describe, expect, it } from "vitest";

import {
  classifyConsoleStream,
  createLineReader,
  MAX_CONSOLE_LINE_LENGTH,
} from "./consoleLog";

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
