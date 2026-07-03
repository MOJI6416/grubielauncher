import { describe, expect, it } from "vitest";
import path from "node:path";
import { createPathUtils } from "./path";

const win = createPathUtils(true);
const posix = createPathUtils(false);

const joinCases: string[][] = [
  ["C:\\Users\\profi", "AppData", "Roaming"],
  ["C:\\Users\\profi\\", "\\AppData\\", "settings.json"],
  ["C:/Users/profi", "minecraft/versions", "1.21"],
  ["C:\\a\\b", "..", "c"],
  ["C:\\a\\b", ".", "c"],
  ["C:\\a", "b", "..", "..", "..", "c"],
  ["\\\\server\\share", "folder", "file.txt"],
  ["\\\\server\\share\\", "a\\b"],
  ["relative", "sub", "file.json"],
  ["a", "..", ".."],
  ["a/b/"],
  ["C:\\only"],
];

const posixJoinCases: string[][] = [
  ["/home/user", ".grubielauncher", "settings.json"],
  ["/home/user/", "/minecraft/", "versions"],
  ["/a/b", "..", "c"],
  ["a", "b", "..", "..", "..", "c"],
  ["relative", "./sub", "file"],
  ["/a/b/"],
];

const nameCases: Array<[string, string | undefined]> = [
  ["C:\\dir\\file.json", undefined],
  ["C:\\dir\\file.json", ".json"],
  ["C:\\dir\\file.json", ".txt"],
  ["C:\\dir\\archive.tar.gz", ".gz"],
  ["C:\\dir\\sub\\", undefined],
  ["file.txt", undefined],
  [".hidden", undefined],
  ["noext", undefined],
  ["C:\\dir\\file.", undefined],
  ["C:/mixed/slashes/name.png", undefined],
];

const posixNameCases: Array<[string, string | undefined]> = [
  ["/home/user/file.json", undefined],
  ["/home/user/file.json", ".json"],
  ["/home/user/dir/", undefined],
  ["back\\slash.txt", undefined],
  [".bashrc", undefined],
];

describe("createPathUtils win32", () => {
  it.each(joinCases.map((args) => [args.join(" | "), args] as const))(
    "join %s",
    (_, args) => {
      expect(win.join(...args)).toBe(path.win32.join(...args));
    },
  );

  it.each(nameCases)("basename/extname %s %s", (input, suffix) => {
    expect(win.basename(input, suffix)).toBe(path.win32.basename(input, suffix));
    expect(win.extname(input)).toBe(path.win32.extname(input));
  });

  it("join without args", () => {
    expect(win.join()).toBe(path.win32.join());
    expect(win.join("")).toBe(path.win32.join(""));
  });
});

describe("createPathUtils posix", () => {
  it.each(posixJoinCases.map((args) => [args.join(" | "), args] as const))(
    "join %s",
    (_, args) => {
      expect(posix.join(...args)).toBe(path.posix.join(...args));
    },
  );

  it.each(posixNameCases)("basename/extname %s %s", (input, suffix) => {
    expect(posix.basename(input, suffix)).toBe(
      path.posix.basename(input, suffix),
    );
    expect(posix.extname(input)).toBe(path.posix.extname(input));
  });
});
