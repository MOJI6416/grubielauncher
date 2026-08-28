import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  pointsForAchievements,
  resolveAchievementPoints,
} from "./achievements";

const someIds = ACHIEVEMENTS.slice(0, 3).map((def) => def.id);
const localPoints = pointsForAchievements(someIds);

describe("resolveAchievementPoints", () => {
  it("takes the number the server already counted", () => {
    expect(resolveAchievementPoints(910, someIds)).toBe(910);
    expect(resolveAchievementPoints(0, someIds)).toBe(0);
  });

  it("falls back to the local catalog when the server sent nothing", () => {
    expect(resolveAchievementPoints(undefined, someIds)).toBe(localPoints);
    expect(resolveAchievementPoints(null, someIds)).toBe(localPoints);
  });

  it("ignores a broken value instead of showing it", () => {
    expect(resolveAchievementPoints(Number.NaN, someIds)).toBe(localPoints);
    expect(resolveAchievementPoints(-5, someIds)).toBe(localPoints);
  });
});
