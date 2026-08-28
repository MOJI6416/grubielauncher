import { describe, expect, it } from "vitest";
import { IServer } from "@/types/ServersList";
import {
  ServerStatus,
  countOnline,
  filterServers,
  findDuplicateAddress,
  findDuplicateName,
  normalizeAddress,
  reorder,
  sortServers,
  validateAddress,
} from "./serverList";

const server = (name: string, ip: string): IServer => ({
  name,
  ip,
  acceptTextures: null,
});

describe("reorder", () => {
  it("moves an item down and up", () => {
    expect(reorder([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(reorder([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
  });

  it("returns the same array for a no-op or an out of range move", () => {
    const list = [1, 2, 3];
    expect(reorder(list, 1, 1)).toBe(list);
    expect(reorder(list, -1, 0)).toBe(list);
    expect(reorder(list, 0, 5)).toBe(list);
  });
});

describe("normalizeAddress", () => {
  it("drops the scheme, the default port and the case", () => {
    expect(normalizeAddress("  TCP://Play.Example.NET:25565/ ")).toBe(
      "play.example.net",
    );
  });

  it("keeps a custom port", () => {
    expect(normalizeAddress("Play.Example.net:25577")).toBe(
      "play.example.net:25577",
    );
  });

  it("keeps bracketed ipv6 intact", () => {
    expect(normalizeAddress("[::1]:25565")).toBe("[::1]");
    expect(normalizeAddress("[::1]:25577")).toBe("[::1]:25577");
  });
});

describe("validateAddress", () => {
  it("accepts hosts, ports and ipv6", () => {
    expect(validateAddress("play.example.net")).toBeNull();
    expect(validateAddress("play.example.net:25577")).toBeNull();
    expect(validateAddress("127.0.0.1:25565")).toBeNull();
    expect(validateAddress("[::1]:25565")).toBeNull();
  });

  it("names the problem", () => {
    expect(validateAddress("   ")).toBe("empty");
    expect(validateAddress("play example.net")).toBe("spaces");
    expect(validateAddress("play.example.net:70000")).toBe("port");
    expect(validateAddress("play.example.net:abc")).toBe("port");
    expect(validateAddress("play.example.net:1:2")).toBe("port");
    expect(validateAddress("пример.рф")).toBe("host");
  });
});

describe("duplicates", () => {
  const servers = [
    server("One", "play.example.net"),
    server("Two", "other.example.net:25577"),
  ];

  it("matches addresses that only differ by the default port", () => {
    expect(findDuplicateAddress(servers, "PLAY.example.net:25565")).toBe(0);
    expect(findDuplicateAddress(servers, "third.example.net")).toBe(-1);
  });

  it("ignores the row being edited", () => {
    expect(findDuplicateAddress(servers, "play.example.net", 0)).toBe(-1);
    expect(findDuplicateName(servers, "one", 0)).toBe(-1);
    expect(findDuplicateName(servers, " ONE ")).toBe(0);
  });
});

describe("filterServers", () => {
  const servers = [
    server("Survival", "play.example.net"),
    server("Creative", "build.example.net"),
  ];

  it("matches the name and the address", () => {
    expect(filterServers(servers, "surv")).toEqual([servers[0]]);
    expect(filterServers(servers, "BUILD")).toEqual([servers[1]]);
    expect(filterServers(servers, "  ")).toBe(servers);
  });
});

describe("sortServers", () => {
  const servers = [
    server("Bravo", "b.example.net"),
    server("Alpha", "a.example.net"),
    server("Charlie", "c.example.net"),
  ];

  const statuses: Record<string, ServerStatus> = {
    "b.example.net": {
      state: "online",
      latencyMs: 200,
      players: { online: 3, max: 20 },
    },
    "a.example.net": { state: "offline" },
    "c.example.net": {
      state: "online",
      latencyMs: 40,
      players: { online: 12, max: 20 },
    },
  };

  it("keeps the stored order in manual mode", () => {
    expect(sortServers(servers, "manual", statuses)).toBe(servers);
  });

  it("sorts by name, by players and by ping", () => {
    expect(
      sortServers(servers, "name", statuses).map((entry) => entry.name),
    ).toEqual(["Alpha", "Bravo", "Charlie"]);

    expect(
      sortServers(servers, "players", statuses).map((entry) => entry.name),
    ).toEqual(["Charlie", "Bravo", "Alpha"]);

    expect(
      sortServers(servers, "ping", statuses).map((entry) => entry.name),
    ).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("does not mutate the source list", () => {
    const copy = [...servers];
    sortServers(servers, "name", statuses);
    expect(servers).toEqual(copy);
  });
});

describe("countOnline", () => {
  it("counts only servers that answered", () => {
    expect(
      countOnline(
        [server("a", "a"), server("b", "b"), server("c", "c")],
        {
          a: { state: "online" },
          b: { state: "offline" },
          c: { state: "pending" },
        },
      ),
    ).toBe(1);
  });
});
