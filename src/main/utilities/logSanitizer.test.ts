import { describe, expect, it } from "vitest";
import {
  compactLog,
  prepareLogForAnalysis,
  redactNickname,
  redactSecrets,
} from "./logSanitizer";

describe("redactSecrets", () => {
  it("strips the user name from windows and unix paths", () => {
    const redacted = redactSecrets(
      [
        "C:\\Users\\Ivan\\AppData\\Roaming\\.grubielauncher\\logs\\latest.log",
        "/home/ivan/.grubielauncher/minecraft",
        "/Users/ivan/Library/Application Support",
      ].join("\n"),
    );

    expect(redacted).toContain("C:\\Users\\<user>\\AppData");
    expect(redacted).toContain("/home/<user>/.grubielauncher");
    expect(redacted).toContain("/Users/<user>/Library");
    expect(redacted).not.toContain("Ivan");
    expect(redacted).not.toContain("ivan");
  });

  it("strips tokens, emails and identifiers", () => {
    const redacted = redactSecrets(
      [
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
        "contact: player@example.com",
        "profile 123e4567-e89b-12d3-a456-426614174000",
        "offline id 069a79f444e94726a5befca90e38aaf5",
        'accessToken="abcdef0123456789"',
      ].join("\n"),
    );

    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).not.toContain("player@example.com");
    expect(redacted).not.toContain("123e4567");
    expect(redacted).not.toContain("069a79f4");
    expect(redacted).not.toContain("abcdef0123456789");
    expect(redacted).toContain('accessToken="<secret>');
  });

  it("redacts addresses but keeps version numbers", () => {
    const redacted = redactSecrets(
      [
        "Connecting to 203.0.113.7:25565",
        "server at 192.168.1.15",
        "Forge 47.2.0.1 and mod 1.20.1.5 loaded",
      ].join("\n"),
    );

    expect(redacted).toContain("<ip>");
    expect(redacted).not.toContain("203.0.113.7");
    expect(redacted).not.toContain("192.168.1.15");
    expect(redacted).toContain("47.2.0.1");
    expect(redacted).toContain("1.20.1.5");
  });
});

describe("redactNickname", () => {
  it("replaces the player name case-insensitively", () => {
    expect(redactNickname("Player Steve_92 joined", "steve_92")).toBe(
      "Player <player> joined",
    );
  });

  it("does not eat class names that contain a short nickname", () => {
    const line = "at com.foxmod.FoxBlock.render(FoxBlock.java:42)";

    expect(redactNickname(line, "Fox")).toBe(line);
    expect(redactNickname(line, "Foxy")).toBe(line);
  });

  it("still redacts a three-letter nickname standing on its own", () => {
    expect(redactNickname("Setting user: Fox", "Fox")).toBe(
      "Setting user: <player>",
    );
  });

  it("never redacts nicknames that collide with technical words", () => {
    const line = "java.lang.NullPointerException in thread main";

    expect(redactNickname(line, "Java")).toBe(line);
    expect(redactNickname(line, "thread")).toBe(line);
  });

  it("leaves short or missing nicknames alone", () => {
    expect(redactNickname("ab cd", "ab")).toBe("ab cd");
    expect(redactNickname("ab cd", undefined)).toBe("ab cd");
  });
});

describe("redactSecrets player names", () => {
  it("strips launch arguments, chat and join lines of any player", () => {
    const redacted = redactSecrets(
      [
        "ModLauncher running: args [--username, Ivan123, --version, 1.20.1]",
        "Setting user: Ivan123",
        "[12:00:00] [Render thread/INFO]: [CHAT] <Bob> hello",
        "[12:00:01] [Server thread/INFO]: Alice joined the game",
        "[12:00:02] [Render thread/INFO]: [CHAT] [Admin] Carol: hi",
        "[12:00:03] [Render thread/INFO]: [CHAT] Dave » hey",
      ].join("\n"),
    );

    expect(redacted).not.toContain("Ivan123");
    expect(redacted).not.toContain("Bob");
    expect(redacted).not.toContain("Alice");
    expect(redacted).not.toContain("Carol");
    expect(redacted).not.toContain("Dave");
    expect(redacted).toContain("<player>");
  });

  it("strips credentials from an hs_err environment block", () => {
    const redacted = redactSecrets(
      [
        "USERNAME=Ivan",
        "HOMEPATH=\\Users\\Ivan",
        "USERDOMAIN=IVAN-DESKTOP",
        "GITHUB_TOKEN=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345",
        "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY",
        "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz",
        "java_command: net.minecraft.client.main.Main --accessToken Aa1Bb2Cc3Dd4Ee5 --userType msa",
      ].join("\n"),
    );

    expect(redacted).not.toContain("Ivan");
    expect(redacted).not.toContain("IVAN-DESKTOP");
    expect(redacted).not.toContain("ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(redacted).not.toContain("wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY");
    expect(redacted).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz");
    expect(redacted).not.toContain("Aa1Bb2Cc3Dd4Ee5");
    expect(redacted).toContain("--userType msa");
  });

  it("redacts lowercase snake_case secrets from mod configs", () => {
    const redacted = redactSecrets(
      [
        "Failed to parse config entry: bot_token=MTIzNDU2Nzg5.GaBcDe.FgHiJk",
        "github_token=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345",
        "curseforge_api_key=$2a$10$abcdefghijklmnop",
        "SESSION_ID=abcdef0123",
      ].join("\n"),
    );

    expect(redacted).not.toContain("MTIzNDU2Nzg5");
    expect(redacted).not.toContain("ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).not.toContain("abcdef0123");
  });

  it("keeps class names that merely contain a keyword", () => {
    const redacted = redactSecrets(
      [
        "[main/INFO]: SessionManager: initialized with 3 profiles",
        "MinecraftSessionService: Failed to verify username",
        "Tokenizer: parsed 42 tokens",
        "net.foo.TokenHandler=enabled",
      ].join("\n"),
    );

    expect(redacted).toContain("SessionManager: initialized");
    expect(redacted).toContain("MinecraftSessionService: Failed");
    expect(redacted).toContain("Tokenizer: parsed");
    expect(redacted).toContain("TokenHandler=enabled");
  });

  it("is case insensitive about user paths and bearer tokens", () => {
    const redacted = redactSecrets(
      "c:\\users\\ivan\\appdata AUTHORIZATION: BEARER abcdefghijkl",
    );

    expect(redacted).not.toContain("ivan");
    expect(redacted).not.toContain("abcdefghijkl");
  });
});

describe("compactLog", () => {
  it("drops debug noise and keeps failures", () => {
    const compacted = compactLog(
      [
        "[12:00:00] [main/DEBUG]: loading registry",
        "[12:00:01] [main/INFO]: Loaded 300 recipes",
        "[12:00:02] [main/ERROR]: java.lang.NullPointerException",
        "  at java.base/java.util.Objects.requireNonNull(Objects.java:233)",
      ].join("\n"),
      10000,
    );

    expect(compacted).not.toContain("loading registry");
    expect(compacted).not.toContain("java.base/java.util.Objects");
    expect(compacted).toContain("NullPointerException");
    expect(compacted).toContain("Loaded 300 recipes");
  });

  it("keeps debug lines that carry the failure", () => {
    const compacted = compactLog(
      "[main/DEBUG]: exception while loading",
      10000,
    );

    expect(compacted).toContain("exception while loading");
  });

  it("collapses repeated lines that differ only by numbers", () => {
    const lines = Array.from(
      { length: 20 },
      (_, i) => `[12:00:00] [main/INFO]: Saving chunk ${i}`,
    );

    const compacted = compactLog(lines.join("\n"), 10000);

    expect(compacted.split("\n")).toHaveLength(3);
  });

  it("keeps the tail when over the size cap", () => {
    const compacted = compactLog(
      ["first line", "second line", "third line"].join("\n"),
      20,
    );

    expect(compacted).toContain("third line");
    expect(compacted).not.toContain("first line");
    expect(compacted.length).toBeLessThanOrEqual(20);
  });
});

describe("prepareLogForAnalysis", () => {
  it("redacts and compacts in one pass", () => {
    const prepared = prepareLogForAnalysis(
      [
        "[main/DEBUG]: noise",
        "C:\\Users\\Ivan\\mods",
        "Steve_92 failed to join",
      ].join("\n"),
      { maxChars: 10000, nickname: "Steve_92" },
    );

    expect(prepared).not.toContain("noise");
    expect(prepared).not.toContain("Ivan");
    expect(prepared).not.toContain("Steve_92");
    expect(prepared).toContain("<player> failed to join");
  });
});
