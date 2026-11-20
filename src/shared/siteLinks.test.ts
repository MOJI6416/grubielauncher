import { describe, expect, it } from "vitest";
import {
  DISCORD_INVITE_URL,
  DOWNLOAD_URL,
  buildPackUrl,
  buildProfileUrl,
  buildRpcButtons,
} from "./siteLinks";

const labels = {
  profile: "Профиль",
  pack: "Сборка",
  download: "Скачать",
  discord: "Discord",
};

describe("profile link", () => {
  it("points at /u/ with the player id so a namesake does not open", () => {
    expect(buildProfileUrl("Steve", "65f0a1b2c3")).toBe(
      "https://grubielauncher.com/u/Steve?id=65f0a1b2c3",
    );
  });

  it("encodes nicknames that are not plain ascii", () => {
    expect(buildProfileUrl("Игрок 1")).toBe(
      "https://grubielauncher.com/u/%D0%98%D0%B3%D1%80%D0%BE%D0%BA%201",
    );
    expect(buildProfileUrl("a/b?c")).toBe(
      "https://grubielauncher.com/u/a%2Fb%3Fc",
    );
  });

  it("drops an id the site would not accept and keeps the nickname", () => {
    expect(buildProfileUrl("Alex", "../../admin")).toBe(
      "https://grubielauncher.com/u/Alex",
    );
  });

  it("has no link without a nickname", () => {
    expect(buildProfileUrl("   ")).toBeNull();
    expect(buildProfileUrl(undefined, "abc")).toBeNull();
  });
});

describe("pack link", () => {
  it("keeps the short code readable", () => {
    expect(buildPackUrl("ABCD-EFGH")).toBe(
      "https://grubielauncher.com/pack/ABCD-EFGH",
    );
  });
});

describe("discord buttons", () => {
  it("shows the profile and the public pack instead of download and discord", () => {
    expect(
      buildRpcButtons({
        profileUrl: "https://grubielauncher.com/u/Steve?id=1",
        packUrl: "https://grubielauncher.com/pack/ABCD-EFGH",
        labels,
      }),
    ).toEqual([
      { label: "Профиль", url: "https://grubielauncher.com/u/Steve?id=1" },
      { label: "Сборка", url: "https://grubielauncher.com/pack/ABCD-EFGH" },
    ]);
  });

  it("fills the free place with download", () => {
    expect(
      buildRpcButtons({
        profileUrl: "https://grubielauncher.com/u/Steve",
        labels,
      }),
    ).toEqual([
      { label: "Профиль", url: "https://grubielauncher.com/u/Steve" },
      { label: "Скачать", url: DOWNLOAD_URL },
    ]);

    expect(
      buildRpcButtons({
        packUrl: "https://grubielauncher.com/pack/ABCD-EFGH",
        labels,
      }).map((button) => button.label),
    ).toEqual(["Сборка", "Скачать"]);
  });

  it("keeps the old pair when there is nothing to link", () => {
    expect(buildRpcButtons({ labels })).toEqual([
      { label: "Скачать", url: DOWNLOAD_URL },
      { label: "Discord", url: DISCORD_INVITE_URL },
    ]);
  });

  it("never passes Discord a link it refuses", () => {
    const long = `https://grubielauncher.com/u/${"x".repeat(600)}`;
    expect(
      buildRpcButtons({
        profileUrl: long,
        packUrl: "http://grubielauncher.com/pack/x",
        labels,
      }).map((button) => button.url),
    ).toEqual([DOWNLOAD_URL, DISCORD_INVITE_URL]);
  });

  it("cuts labels to the 32 characters Discord allows", () => {
    const [button] = buildRpcButtons({
      profileUrl: "https://grubielauncher.com/u/Steve",
      labels: { ...labels, profile: "Profil".repeat(10) },
    });
    expect(button.label.length).toBeLessThanOrEqual(32);
    expect(button.label.endsWith("…")).toBe(true);
  });
});
