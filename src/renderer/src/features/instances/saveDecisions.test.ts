import { describe, expect, it } from "vitest";
import {
  StoredInstanceConf,
  hasQuickServerChanged,
  haveArgumentsChanged,
  isRenameRequested,
  mergeExternalServers,
  repointLocalImage,
  restoreInstanceConf,
  shouldOfferPublish,
  snapshotInstanceConf,
} from "./saveDecisions";

describe("repointLocalImage", () => {
  it("follows a windows path after a rename", () => {
    const image = "file://C:\\games\\versions\\Old\\logo.png";

    expect(
      repointLocalImage(image, "C:\\games\\versions\\Old", "C:\\games\\versions\\New"),
    ).toBe("file://C:\\games\\versions\\New\\logo.png");
  });

  it("follows a path stored with forward slashes", () => {
    const image = "file://C:/games/versions/Old/logo.png";

    expect(
      repointLocalImage(image, "C:\\games\\versions\\Old", "C:\\games\\versions\\New"),
    ).toBe("file://C:/games/versions/New/logo.png");
  });

  it("follows a percent-encoded path", () => {
    const image = "file://C:/games/versions/My%20Pack/logo.png";

    expect(
      repointLocalImage(
        image,
        "C:\\games\\versions\\My Pack",
        "C:\\games\\versions\\New Pack",
      ),
    ).toBe("file://C:/games/versions/New%20Pack/logo.png");
  });

  it("keeps the cache-busting query intact", () => {
    const image = "file://C:/versions/Old/logo.png?v=12";

    expect(repointLocalImage(image, "C:/versions/Old", "C:/versions/New")).toBe(
      "file://C:/versions/New/logo.png?v=12",
    );
  });

  it("leaves remote and empty images alone", () => {
    expect(repointLocalImage("https://cdn/logo.png", "a", "b")).toBeNull();
    expect(repointLocalImage("", "a", "b")).toBeNull();
    expect(repointLocalImage(undefined, "a", "b")).toBeNull();
  });

  it("reports no match when the path is unrelated", () => {
    expect(
      repointLocalImage("file://C:/other/logo.png", "C:/versions/Old", "C:/versions/New"),
    ).toBeNull();
  });
});

describe("isRenameRequested", () => {
  it("ignores surrounding spaces", () => {
    expect(isRenameRequested("  Pack  ", "Pack")).toBe(false);
    expect(isRenameRequested("Pack 2", "Pack")).toBe(true);
  });
});

describe("haveArgumentsChanged", () => {
  it("treats missing arguments as empty strings", () => {
    expect(haveArgumentsChanged({ game: "", jvm: "" }, undefined)).toBe(false);
    expect(haveArgumentsChanged({ game: "", jvm: "-Xmx4G" }, undefined)).toBe(
      true,
    );
  });

  it("detects a change in either field", () => {
    const current = { game: "--demo", jvm: "-Xmx2G" };

    expect(haveArgumentsChanged({ game: "--demo", jvm: "-Xmx2G" }, current)).toBe(
      false,
    );
    expect(haveArgumentsChanged({ game: "", jvm: "-Xmx2G" }, current)).toBe(true);
    expect(haveArgumentsChanged({ game: "--demo", jvm: "" }, current)).toBe(true);
  });
});

describe("hasQuickServerChanged", () => {
  it("compares the quick connect address", () => {
    expect(hasQuickServerChanged("play.net", "play.net")).toBe(false);
    expect(hasQuickServerChanged("play.net", undefined)).toBe(true);
    expect(hasQuickServerChanged(undefined, "play.net")).toBe(true);
  });
});

describe("shouldOfferPublish", () => {
  const base = {
    changed: true,
    shareCode: "code",
    isDownloadedVersion: false,
    isNetwork: true,
    isVersionRunning: false,
  };

  it("offers publishing for an owned, published, idle instance", () => {
    expect(shouldOfferPublish(base)).toBe(true);
  });

  it("stays silent when nothing publishable changed", () => {
    expect(shouldOfferPublish({ ...base, changed: false })).toBe(false);
  });

  it("stays silent for an instance that was never published", () => {
    expect(shouldOfferPublish({ ...base, shareCode: undefined })).toBe(false);
  });

  it("stays silent for someone else's downloaded instance", () => {
    expect(shouldOfferPublish({ ...base, isDownloadedVersion: true })).toBe(
      false,
    );
  });

  it("stays silent offline and while the game runs", () => {
    expect(shouldOfferPublish({ ...base, isNetwork: false })).toBe(false);
    expect(shouldOfferPublish({ ...base, isVersionRunning: true })).toBe(false);
  });
});

describe("snapshotInstanceConf", () => {
  const stored = (): StoredInstanceConf => ({
    loader: { mods: [{ title: "sodium" } as never] },
    lastUpdate: new Date("2026-01-01T00:00:00.000Z"),
    overrides: undefined,
    runArguments: { game: "", jvm: "" },
    image: "file://C:/pack/logo.png",
    quickServer: undefined,
  });

  it("puts back every field a failed save had already applied in memory", () => {
    const conf = stored();
    const snapshot = snapshotInstanceConf(conf);

    conf.loader.mods = [{ title: "sodium" } as never, { title: "lithium" } as never];
    conf.lastUpdate = new Date("2026-02-02T00:00:00.000Z");
    conf.overrides = { xmx: 4096 };
    conf.runArguments = { game: "--demo", jvm: "-Xss2M" };
    conf.image = "";
    conf.quickServer = "play.example.com";

    restoreInstanceConf(conf, snapshot);

    expect(conf).toEqual(stored());
  });

  it("keeps the snapshot independent of later mutations", () => {
    const conf = stored();
    const snapshot = snapshotInstanceConf(conf);

    conf.overrides = { xmx: 2048 };

    expect(snapshot.overrides).toBeUndefined();
  });
});

describe("mergeExternalServers", () => {
  const server = (name: string, ip: string) => ({
    name,
    ip,
    acceptTextures: null,
  });

  it("keeps a server that appeared in the file after the screen opened", () => {
    const snapshot = [server("Grubie Demo", "demo.grubie.com")];
    const stored = [
      server("Мир друга", "friend.example.net"),
      server("Grubie Demo", "demo.grubie.com"),
    ];
    const draft = [server("Grubie Demo", "demo.grubie.com")];

    expect(mergeExternalServers(draft, stored, snapshot)).toEqual([
      server("Grubie Demo", "demo.grubie.com"),
      server("Мир друга", "friend.example.net"),
    ]);
  });

  it("does not resurrect a server the player deleted in the launcher", () => {
    const snapshot = [
      server("Grubie Demo", "demo.grubie.com"),
      server("Старый", "old.example.net"),
    ];

    expect(mergeExternalServers([snapshot[0]], snapshot, snapshot)).toEqual([
      snapshot[0],
    ]);
  });

  it("does not duplicate an address the player added by hand", () => {
    const snapshot: ReturnType<typeof server>[] = [];
    const stored = [server("Мир друга", "friend.example.net")];
    const draft = [server("Свой ярлык", "FRIEND.example.net ")];

    expect(mergeExternalServers(draft, stored, snapshot)).toBe(draft);
  });

  it("falls back to the draft when the file could not be read", () => {
    const draft = [server("Grubie Demo", "demo.grubie.com")];

    expect(mergeExternalServers(draft, null, draft)).toBe(draft);
  });

  it("does not resurrect a server deleted outside the screen", () => {
    const snapshot = [
      server("Grubie Demo", "demo.grubie.com"),
      server("Кооп", "coop.example.net"),
    ];
    const stored = [server("Grubie Demo", "demo.grubie.com")];
    const draft = [
      { ...snapshot[0], acceptTextures: 1 },
      server("Кооп", "coop.example.net"),
    ];

    expect(mergeExternalServers(draft, stored, snapshot)).toEqual([
      { ...snapshot[0], acceptTextures: 1 },
    ]);
  });

  it("keeps an address the player added while it was deleted outside", () => {
    const snapshot = [server("Кооп", "coop.example.net")];
    const stored: ReturnType<typeof server>[] = [];
    const draft = [server("Кооп", "coop.example.net"), server("Новый", "new.example.net")];

    expect(mergeExternalServers(draft, stored, snapshot)).toEqual([
      server("Новый", "new.example.net"),
    ]);
  });

  it("applies an address changed outside instead of restoring the old one", () => {
    const snapshot = [server("Кооп", "coop.example.net")];
    const stored = [server("Кооп", "coop2.example.net")];
    const draft = [{ ...snapshot[0], acceptTextures: 0 }];

    expect(mergeExternalServers(draft, stored, snapshot)).toEqual([
      server("Кооп", "coop2.example.net"),
    ]);
  });

  it("ignores entries without an address", () => {
    expect(
      mergeExternalServers([], [server("Пусто", "")], []),
    ).toEqual([]);
  });
});
