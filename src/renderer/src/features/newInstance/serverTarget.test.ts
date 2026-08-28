import { describe, expect, it } from "vitest";
import {
  minecraftVersionFromPing,
  parseServerAddress,
  serverInstanceName,
  serverListName,
} from "./serverTarget";

describe("parseServerAddress", () => {
  it("accepts a bare domain", () => {
    expect(parseServerAddress("mc.hypixel.net")).toEqual({
      host: "mc.hypixel.net",
      port: null,
      address: "mc.hypixel.net",
    });
  });

  it("accepts a domain with a port", () => {
    expect(parseServerAddress("play.example.com:25566")).toEqual({
      host: "play.example.com",
      port: 25566,
      address: "play.example.com:25566",
    });
  });

  it("accepts an ipv4 address without dots in the name", () => {
    expect(parseServerAddress("192.168.1.5:25565")?.host).toBe("192.168.1.5");
  });

  it("strips a pasted scheme and path", () => {
    expect(parseServerAddress("https://play.example.com/join")?.address).toBe(
      "play.example.com",
    );
  });

  it("trims and lowercases", () => {
    expect(parseServerAddress("  Play.Example.COM  ")?.host).toBe(
      "play.example.com",
    );
  });

  it("rejects nonsense", () => {
    expect(parseServerAddress("")).toBeNull();
    expect(parseServerAddress("localhost")).toBeNull();
    expect(parseServerAddress("play.example.com:0")).toBeNull();
    expect(parseServerAddress("play.example.com:70000")).toBeNull();
    expect(parseServerAddress("play.example.com:port")).toBeNull();
    expect(parseServerAddress("play example.com")).toBeNull();
    expect(parseServerAddress("300.1.1.1")).toBeNull();
  });
});

describe("minecraftVersionFromPing", () => {
  it("pulls the version out of a server brand string", () => {
    expect(minecraftVersionFromPing("Paper 1.21.4")).toBe("1.21.4");
    expect(minecraftVersionFromPing("1.20.1")).toBe("1.20.1");
    expect(minecraftVersionFromPing("Velocity 1.7.2-1.21.4")).toBe("1.21.4");
    expect(minecraftVersionFromPing("Requires MC 1.19.2")).toBe("1.19.2");
  });

  it("returns nothing when the brand carries no version", () => {
    expect(minecraftVersionFromPing("")).toBeNull();
    expect(minecraftVersionFromPing(null)).toBeNull();
    expect(minecraftVersionFromPing("BungeeCord")).toBeNull();
  });
});

describe("serverListName", () => {
  it("takes the first motd line", () => {
    expect(serverListName("FunnyMC\nSurvival", "tmc.funnymc.net")).toBe(
      "FunnyMC",
    );
  });

  it("drops emoji so servers.dat stays readable", () => {
    expect(
      serverListName("🗡 FunnyMC 🗡 [1.8-26.2+]", "tmc.funnymc.net"),
    ).toBe("FunnyMC  [1.8-26.2+]");
  });

  it("strips minecraft colour codes", () => {
    expect(serverListName("§aFunny§bMC", "tmc.funnymc.net")).toBe("FunnyMC");
  });

  it("never leaves a half emoji after the length cut", () => {
    const name = serverListName(`${"a".repeat(31)}🗡bbbb`, "host.example.com");

    expect(name).toBe("a".repeat(31) + "b");
    expect(name.length).toBeLessThanOrEqual(32);
  });

  it("falls back to the host when the motd is empty", () => {
    expect(serverListName("", "tmc.funnymc.net")).toBe("tmc.funnymc.net");
    expect(serverListName(null, "tmc.funnymc.net")).toBe("tmc.funnymc.net");
    expect(serverListName("🗡", "tmc.funnymc.net")).toBe("tmc.funnymc.net");
  });
});

describe("serverInstanceName", () => {
  it("names the instance after the domain", () => {
    expect(
      serverInstanceName({
        host: "mc.hypixel.net",
        port: null,
        address: "mc.hypixel.net",
      }),
    ).toBe("Hypixel");
  });

  it("keeps an ip address as is", () => {
    expect(
      serverInstanceName({
        host: "192.168.1.5",
        port: 25565,
        address: "192.168.1.5:25565",
      }),
    ).toBe("192.168.1.5");
  });
});
