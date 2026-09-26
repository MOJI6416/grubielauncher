import { describe, expect, it } from "vitest";
import { describeError, sanitizeJournalValue } from "./journal";
import { isNodeWarning, splitConsoleTag } from "./consoleCapture";
import { describeRequestTarget } from "./httpTrace";
import { redactCredentials } from "@/shared/logSanitizer";

describe("redactCredentials", () => {
  it("removes tokens but keeps nicknames, paths and addresses", () => {
    const text = [
      "Authorization: Bearer abc.def.ghi",
      "token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig",
      "--accessToken 12345secret --username Steve",
      "key sk-or-v1-0123456789abcdefghijklmnop",
      "C:\\Users\\Steve\\AppData connected to 192.168.1.5:25565",
    ].join("\n");

    const result = redactCredentials(text);

    expect(result).not.toContain("abc.def.ghi");
    expect(result).not.toContain("eyJzdWIi");
    expect(result).not.toContain("12345secret");
    expect(result).not.toContain("sk-or-v1-0123456789");
    expect(result).toContain("--username Steve");
    expect(result).toContain("C:\\Users\\Steve\\AppData");
    expect(result).toContain("192.168.1.5:25565");
  });
});

describe("sanitizeJournalValue", () => {
  it("hides values of secret-looking keys", () => {
    expect(
      sanitizeJournalValue({
        nickname: "Steve",
        accessToken: "abc",
        nested: { refresh_token: "def", apiKey: "ghi", mods: 3 },
      }),
    ).toEqual({
      nickname: "Steve",
      accessToken: "<secret>",
      nested: { refresh_token: "<secret>", apiKey: "<secret>", mods: 3 },
    });
  });

  it("survives cycles, long strings and large arrays", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;

    const result = sanitizeJournalValue({
      cyclic,
      long: "x".repeat(5000),
      list: Array.from({ length: 100 }, (_, index) => index),
    }) as Record<string, any>;

    expect(result.cyclic.self).toBe("[circular]");
    expect(result.long.length).toBeLessThan(2100);
    expect(result.list).toHaveLength(81);
  });
});

describe("describeError", () => {
  it("keeps name, message, code and a short stack", () => {
    const error = Object.assign(new Error("spawn java ENOENT"), {
      code: "ENOENT",
      path: "C:\\java\\bin\\javaw.exe",
    });

    const described = describeError(error);

    expect(described).toMatchObject({
      name: "Error",
      message: "spawn java ENOENT",
      code: "ENOENT",
      path: "C:\\java\\bin\\javaw.exe",
    });
    expect(String(described.stack).split("\n").length).toBeLessThanOrEqual(14);
  });

  it("describes axios failures without the query string", () => {
    const described = describeError({
      isAxiosError: true,
      name: "AxiosError",
      message: "Request failed with status code 503",
      code: "ERR_BAD_RESPONSE",
      config: {
        method: "get",
        baseURL: "https://api.grubielauncher.com",
        url: "/modpacks/abc?token=secret",
      },
      response: { status: 503 },
    });

    expect(described).toMatchObject({
      status: 503,
      method: "GET",
      url: "https://api.grubielauncher.com/modpacks/abc",
    });
  });
});

describe("splitConsoleTag", () => {
  it("turns a bracket prefix into the scope", () => {
    expect(splitConsoleTag("[IPC] version:run error: boom")).toEqual({
      scope: "ipc",
      message: "version:run error: boom",
    });
    expect(splitConsoleTag("plain message")).toEqual({
      scope: "console",
      message: "plain message",
    });
  });

  it("recognises Node process warnings so they are not counted as errors", () => {
    const text =
      "(node:5252) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.";
    expect(isNodeWarning(text)).toBe(true);
    expect(splitConsoleTag(text).scope).toBe("node");
    expect(isNodeWarning("Error: spawn ENOENT")).toBe(false);
  });
});

describe("describeRequestTarget", () => {
  it("joins base and path and drops the query", () => {
    expect(
      describeRequestTarget({
        method: "post",
        baseURL: "https://api.grubielauncher.com",
        url: "/support-reports?x=1",
      }),
    ).toEqual({
      method: "POST",
      target: "api.grubielauncher.com/support-reports",
      hasQuery: true,
    });
  });
});
