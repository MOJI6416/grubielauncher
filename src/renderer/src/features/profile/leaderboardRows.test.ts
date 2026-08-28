import { describe, expect, it } from "vitest";
import {
  buildFriendLeaderboard,
  buildGlobalLeaderboard,
  findSelfRow,
} from "./leaderboardRows";

const pointsOf = (server: number | undefined, ids: readonly string[]) =>
  typeof server === "number" ? server : ids.length * 10;
const levelOf = (points: number) => Math.floor(points / 20) + 1;

const user = (id: string, nickname: string, achievements: string[] = []) => ({
  _id: id,
  nickname,
  achievements,
});

describe("buildFriendLeaderboard", () => {
  it("ranks by points and marks the viewer", () => {
    const rows = buildFriendLeaderboard(
      user("me", "moji", ["a"]),
      [user("f1", "kit", ["a", "b", "c"]), user("f2", "zed")],
      pointsOf,
      levelOf,
    );

    expect(rows.map((row) => [row.rank, row.nickname])).toEqual([
      [1, "kit"],
      [2, "moji"],
      [3, "zed"],
    ]);
    expect(findSelfRow(rows)?.nickname).toBe("moji");
    expect(rows[0].level).toBe(levelOf(30));
  });

  it("keeps the viewer in the board when there are no friends", () => {
    const rows = buildFriendLeaderboard(
      user("me", "moji"),
      [],
      pointsOf,
      levelOf,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].isSelf).toBe(true);
  });

  it("drops holes and duplicates in the friend list", () => {
    const rows = buildFriendLeaderboard(
      user("me", "moji"),
      [null, undefined, user("f1", "kit"), user("f1", "kit")],
      pointsOf,
      levelOf,
    );

    expect(rows).toHaveLength(2);
  });

  it("never lets a friend row shadow the viewer entry", () => {
    const rows = buildFriendLeaderboard(
      user("me", "moji", ["a", "b"]),
      [user("me", "moji", [])],
      pointsOf,
      levelOf,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].points).toBe(20);
  });

  it("prefers the points the server already counted", () => {
    const rows = buildFriendLeaderboard(
      { ...user("me", "moji", ["a"]), achievementPoints: 910 },
      [user("f1", "kit", ["a", "b", "c"])],
      pointsOf,
      levelOf,
    );

    expect(rows.map((row) => [row.nickname, row.points])).toEqual([
      ["moji", 910],
      ["kit", 30],
    ]);
  });

  it("breaks a points tie by nickname", () => {
    const rows = buildFriendLeaderboard(
      user("me", "zed"),
      [user("f1", "abe")],
      pointsOf,
      levelOf,
    );

    expect(rows.map((row) => row.nickname)).toEqual(["abe", "zed"]);
  });

  it("carries the provider and uuid so a row can render a player head", () => {
    const rows = buildFriendLeaderboard(
      { ...user("me", "moji"), platform: "discord" as const, uuid: "uuid-me" },
      [{ ...user("f1", "kit"), platform: "elyby" as const, uuid: "uuid-kit" }],
      pointsOf,
      levelOf,
    );

    expect(rows.map((row) => [row.nickname, row.platform, row.uuid])).toEqual([
      ["kit", "elyby", "uuid-kit"],
      ["moji", "discord", "uuid-me"],
    ]);
  });
});

describe("buildGlobalLeaderboard", () => {
  const entries = [
    {
      rank: 1,
      id: "id-kit",
      nickname: "kit",
      headUrl: "https://api.test/skins/head/user/id-kit.png",
      points: 300,
      level: 2,
      achievementsCount: 9,
      isDonor: true,
    },
    {
      rank: 2,
      id: "id-other-moji",
      nickname: "moji",
      headUrl: "https://api.test/skins/head/user/id-other-moji.png",
      points: 120,
      level: 1,
      achievementsCount: 4,
      isDonor: false,
    },
    {
      rank: 3,
      id: "id-me",
      nickname: "moji",
      headUrl: "https://api.test/skins/head/user/id-me.png",
      points: 100,
      level: 1,
      achievementsCount: 3,
      isDonor: false,
    },
  ];

  it("keeps the server ranking and marks the viewer once", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me");

    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(rows.filter((row) => row.isSelf)).toHaveLength(1);
    expect(findSelfRow(rows)?.rank).toBe(3);
  });

  it("never marks a namesake: nicknames are not unique, ids are", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me");

    expect(rows[1].nickname).toBe("moji");
    expect(rows[1].isSelf).toBe(false);
  });

  it("marks nobody when the viewer is outside the board", () => {
    expect(
      findSelfRow(buildGlobalLeaderboard(entries, "id-nobody")),
    ).toBeNull();
  });

  it("marks nobody when the viewer has no id", () => {
    expect(findSelfRow(buildGlobalLeaderboard(entries, ""))).toBeNull();
  });

  it("gives every row a stable unique key", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me");
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it("shows the viewer the same points the rest of the profile shows", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me", {
      points: 315,
      achievements: 16,
      levelOf: (points) => Math.floor(points / 200) + 1,
    });

    const self = findSelfRow(rows)!;
    expect(self.points).toBe(315);
    expect(self.achievements).toBe(16);
    expect(self.level).toBe(2);
    expect(self.rank).toBe(3);
  });

  it("never lowers the server numbers of the viewer", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me", {
      points: 10,
      achievements: 1,
      levelOf: (points) => Math.floor(points / 200) + 1,
    });

    const self = findSelfRow(rows)!;
    expect(self.points).toBe(100);
    expect(self.achievements).toBe(3);
  });

  it("leaves every other row untouched by the viewer totals", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me", {
      points: 999,
      achievements: 40,
      levelOf: (points) => Math.floor(points / 200) + 1,
    });

    expect(rows[0].points).toBe(300);
    expect(rows[1].points).toBe(120);
    expect(rows[1].achievements).toBe(4);
  });

  it("carries the ready-made head url instead of guessing one", () => {
    const rows = buildGlobalLeaderboard(entries, "id-me");

    expect(rows[0].headUrl).toBe("https://api.test/skins/head/user/id-kit.png");
    expect(
      rows.every((row) => row.platform === null && row.uuid === null),
    ).toBe(true);
  });
});
