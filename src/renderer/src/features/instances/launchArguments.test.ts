import { describe, expect, it } from "vitest";
import {
  hasArgumentChanges,
  moveArgument,
  readArguments,
  withArgumentText,
  withArgumentTokens,
} from "./launchArguments";

describe("argument draft", () => {
  it("reads a missing or partial value as empty strings", () => {
    expect(readArguments()).toEqual({ jvm: "", game: "" });
    expect(readArguments({ jvm: "-Xmx4G" } as never)).toEqual({
      jvm: "-Xmx4G",
      game: "",
    });
  });

  it("replaces only the edited side", () => {
    const args = { jvm: "-Xmx4G", game: "--demo" };

    expect(withArgumentText(args, "jvm", "-Xmx8G")).toEqual({
      jvm: "-Xmx8G",
      game: "--demo",
    });
    expect(withArgumentTokens(args, "game", ["--width", "1280"])).toEqual({
      jvm: "-Xmx4G",
      game: "--width 1280",
    });
  });

  it("moves a token to the other tab and back", () => {
    const args = { jvm: "-Xmx4G --demo", game: "--width 1280" };
    const moved = moveArgument(args, "jvm", 1);

    expect(moved).toEqual({ jvm: "-Xmx4G", game: "--width 1280 --demo" });
    expect(moveArgument(moved, "game", 2)).toEqual({
      jvm: "-Xmx4G --demo",
      game: "--width 1280",
    });
  });

  it("returns the very same value when there is nothing at that index", () => {
    const args = { jvm: "-Xmx4G", game: "" };

    expect(moveArgument(args, "jvm", 7)).toBe(args);
    expect(moveArgument(args, "game", 0)).toBe(args);
  });

  it("ignores surrounding whitespace when comparing against what is saved", () => {
    const saved = { jvm: "-Xmx4G", game: "" };

    expect(hasArgumentChanges({ jvm: " -Xmx4G ", game: "" }, saved)).toBe(
      false,
    );
    expect(hasArgumentChanges({ jvm: "-Xmx8G", game: "" }, saved)).toBe(true);
    expect(hasArgumentChanges({ jvm: "", game: "" })).toBe(false);
    expect(hasArgumentChanges({ jvm: "-Xmx4G", game: "" })).toBe(true);
  });

  it("leaves nothing to re-emit once the instance draft is reset", () => {
    const saved = { jvm: "-Xmx4G", game: "" };

    const edited = withArgumentTokens(readArguments(saved), "jvm", [
      "-Xmx4G",
      "-XX:+UseG1GC",
    ]);
    expect(hasArgumentChanges(edited, saved)).toBe(true);

    const afterReset = readArguments(saved);
    expect(afterReset).toEqual(saved);
    expect(hasArgumentChanges(afterReset, saved)).toBe(false);
  });
});
