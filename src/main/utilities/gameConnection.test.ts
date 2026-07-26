import { describe, expect, it } from "vitest";

import { parseMinecraftServerConnectionLine } from "./gameConnection";

describe("Minecraft server connection parser", () => {
  it("parses legacy comma connection log lines", () => {
    expect(
      parseMinecraftServerConnectionLine(
        "[Render thread/INFO]: Connecting to play.example.com, 25566",
      ),
    ).toEqual({
      serverAddress: "play.example.com",
      serverPort: 25566,
    });
  });

  it("parses host:port connection log lines", () => {
    expect(
      parseMinecraftServerConnectionLine("Connecting to /127.0.0.1:25565"),
    ).toEqual({
      serverAddress: "127.0.0.1",
      serverPort: 25565,
    });
  });

  it("parses connected-to-server log lines", () => {
    expect(
      parseMinecraftServerConnectionLine(
        "[Netty Client IO #0/INFO]: Connected to server mc.example.net:25570",
      ),
    ).toEqual({
      serverAddress: "mc.example.net",
      serverPort: 25570,
    });
  });

  it("uses the default Minecraft port for clear host-only markers", () => {
    expect(
      parseMinecraftServerConnectionLine("Connecting to play.example.org"),
    ).toEqual({
      serverAddress: "play.example.org",
      serverPort: 25565,
    });
  });

  it("rejects generic lines without an explicit server host", () => {
    expect(
      parseMinecraftServerConnectionLine("Connecting to authentication server"),
    ).toBeNull();
    expect(parseMinecraftServerConnectionLine("OpenGL server warning")).toBeNull();
  });
});

describe("mod log noise", () => {
  it("ignores host-only lines logged by a third-party mod", () => {
    expect(
      parseMinecraftServerConnectionLine(
        "[Render thread/INFO] [somemod/]: Connecting to api.example.com",
      ),
    ).toBeNull();
  });

  it("still trusts a mod line that carries an explicit port", () => {
    expect(
      parseMinecraftServerConnectionLine(
        "[Render thread/INFO] [somemod/]: Connecting to mc.example.com, 25565",
      ),
    ).toEqual({ serverAddress: "mc.example.com", serverPort: 25565 });
  });

  it("keeps host-only lines coming from the vanilla client logger", () => {
    expect(
      parseMinecraftServerConnectionLine(
        "[Render thread/INFO] [net.minecraft.client.gui.screens.ConnectScreen/]: Connecting to play.example.org",
      ),
    ).toEqual({ serverAddress: "play.example.org", serverPort: 25565 });
  });
});
