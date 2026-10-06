import { describe, expect, it } from "vitest";
import { findStreamingApp, parsePs, parseTasklist } from "./streamingApps";

describe("parseTasklist", () => {
  it("reads image names from the CSV output", () => {
    const stdout = [
      '"System Idle Process","0","Services","0","8 K"',
      '"obs64.exe","1234","Console","1","123,456 K"',
      "",
      '"Streamlabs OBS.exe","4321","Console","1","1 K"',
    ].join("\r\n");

    expect(parseTasklist(stdout)).toEqual([
      "System Idle Process",
      "obs64.exe",
      "Streamlabs OBS.exe",
    ]);
  });
});

describe("parsePs", () => {
  it("keeps the executable name from Linux and macOS output", () => {
    expect(
      parsePs("systemd\nobs\n/Applications/OBS.app/Contents/MacOS/OBS\n"),
    ).toEqual(["systemd", "obs", "OBS"]);
  });
});

describe("findStreamingApp", () => {
  it("recognises streaming software whatever the case", () => {
    expect(findStreamingApp(["explorer.exe", "OBS64.EXE"])).toBe("OBS Studio");
    expect(findStreamingApp(["Streamlabs Desktop.exe"])).toBe("Streamlabs");
    expect(findStreamingApp(["XSplit.Core.exe"])).toBe("XSplit");
  });

  it("ignores everything else", () => {
    expect(
      findStreamingApp(["javaw.exe", "Discord.exe", "obsidian"]),
    ).toBeNull();
  });
});
