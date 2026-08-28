import { describe, expect, it } from "vitest";
import { keepOwnServers } from "./joinServers";

const server = (name: string, ip: string) => ({
  name,
  ip,
  acceptTextures: null,
});

describe("keepOwnServers", () => {
  it("returns the entries the sync dropped", () => {
    expect(
      keepOwnServers(
        [
          server("World of NoctVale", "friend.example.net"),
          server("Grubie Demo", "demo.grubielauncher.com"),
        ],
        [server("Grubie Demo", "demo.grubielauncher.com")],
      ),
    ).toEqual([server("World of NoctVale", "friend.example.net")]);
  });

  it("compares addresses case-insensitively", () => {
    expect(
      keepOwnServers(
        [server("Mine", "Play.Example.NET")],
        [server("pack entry", "play.example.net")],
      ),
    ).toEqual([]);
  });

  it("drops entries without an address", () => {
    expect(keepOwnServers([server("broken", "  ")], [])).toEqual([]);
  });

  it("keeps one copy of a duplicated address", () => {
    expect(
      keepOwnServers(
        [server("one", "mine.example.net"), server("two", "mine.example.net")],
        [],
      ),
    ).toEqual([server("one", "mine.example.net")]);
  });

  it("keeps everything when the sync wiped the list", () => {
    const before = [server("one", "a.example.net"), server("two", "b.example.net")];
    expect(keepOwnServers(before, [])).toEqual(before);
  });
});
