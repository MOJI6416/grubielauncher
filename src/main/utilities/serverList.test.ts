import { describe, expect, it } from "vitest";

import { compareServers } from "./serverList";

describe("compareServers", () => {
  it("treats missing and false resource-pack prompts as the same default", () => {
    expect(
      compareServers(
        [{ name: "Local", ip: "play.example.com", acceptTextures: 0 }],
        [{ name: "Local", ip: "play.example.com" } as any],
      ),
    ).toBe(true);
  });

  it("keeps true resource-pack prompts as meaningful differences", () => {
    expect(
      compareServers(
        [{ name: "Local", ip: "play.example.com", acceptTextures: 1 }],
        [{ name: "Local", ip: "play.example.com" } as any],
      ),
    ).toBe(false);
  });
});
