import { describe, expect, it } from "vitest";
import {
  isLaunchRefusal,
  linuxLaunchPrefix,
  parseLaunchEnv,
  splitCommandLine,
} from "./launchCommand";

describe("splitCommandLine", () => {
  it("splits on spaces and keeps quoted parts together", () => {
    expect(splitCommandLine("gamescope -f -W 1920 --")).toEqual([
      "gamescope",
      "-f",
      "-W",
      "1920",
      "--",
    ]);
    expect(splitCommandLine(`env "A B=1" 'C D'`)).toEqual([
      "env",
      "A B=1",
      "C D",
    ]);
    expect(splitCommandLine(`run \\"x\\" "a\\"b"`)).toEqual([
      "run",
      '"x"',
      'a"b',
    ]);
  });

  it("returns nothing for blank input and null for an open quote", () => {
    expect(splitCommandLine("   ")).toEqual([]);
    expect(splitCommandLine(`prime-run "oops`)).toBeNull();
  });
});

describe("parseLaunchEnv", () => {
  it("reads NAME=value lines and skips comments", () => {
    expect(
      parseLaunchEnv(
        "# tuning\n__GL_THREADED_OPTIMIZATIONS=1\nMESA_GL_VERSION_OVERRIDE=\"4.6\"\n\nEMPTY=",
      ),
    ).toEqual({
      env: {
        __GL_THREADED_OPTIMIZATIONS: "1",
        MESA_GL_VERSION_OVERRIDE: "4.6",
        EMPTY: "",
      },
      invalid: [],
    });
  });

  it("reports lines that are not assignments", () => {
    expect(parseLaunchEnv("1BAD=x\njust text\nOK=1").invalid).toEqual([
      "1BAD=x",
      "just text",
    ]);
  });
});

describe("linuxLaunchPrefix", () => {
  const installed = { gamemode: true, mangohud: true };

  it("puts the wrapper first, then GameMode and MangoHud", () => {
    expect(
      linuxLaunchPrefix({
        wrapperCommand: "prime-run",
        gameMode: true,
        mangoHud: true,
        installed,
      }),
    ).toEqual({
      prefix: ["prime-run", "gamemoderun", "mangohud"],
      missing: [],
      invalidWrapper: false,
    });
  });

  it("skips tools that are not installed and does not add them twice", () => {
    expect(
      linuxLaunchPrefix({
        wrapperCommand: "gamemoderun",
        gameMode: true,
        mangoHud: true,
        installed: { gamemode: true, mangohud: false },
      }),
    ).toEqual({
      prefix: ["gamemoderun"],
      missing: ["mangohud"],
      invalidWrapper: false,
    });
  });

  it("drops a wrapper with an open quote", () => {
    expect(
      linuxLaunchPrefix({
        wrapperCommand: `prime-run "x`,
        gameMode: true,
        installed,
      }),
    ).toEqual({ prefix: ["gamemoderun"], missing: [], invalidWrapper: true });
  });
});

describe("isLaunchRefusal", () => {
  it("tells a hook refusal from a plain result", () => {
    expect(isLaunchRefusal(true)).toBe(false);
    expect(isLaunchRefusal(false)).toBe(false);
    expect(
      isLaunchRefusal({
        refused: "preLaunchHook",
        exitCode: 1,
        output: "",
        timedOut: false,
      }),
    ).toBe(true);
  });
});
