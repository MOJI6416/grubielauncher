import { describe, expect, it } from "vitest";

import { classifyConsoleStream } from "./consoleLog";

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
