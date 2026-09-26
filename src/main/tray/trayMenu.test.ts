import { describe, expect, it } from "vitest";
import { TrayModel } from "@/types/Tray";
import {
  buildTrayMenu,
  buildTrayTooltip,
  sanitizeTrayModel,
  TrayMenuEntry,
} from "./trayMenu";

const labels: TrayModel["labels"] = {
  open: "Открыть",
  play: "Играть",
  running: "запущена",
  voice: "Голос",
  mute: "Выключить микрофон",
  deafen: "Выключить звук",
  leave: "Покинуть звонок",
  incoming: "Входящий звонок",
  accept: "Принять",
  decline: "Отклонить",
  quit: "Выйти",
  installUpdate: "Обновить до 2.0.5",
  playing: "Играет",
  hintTitle: "Работает в фоне",
  hintBody: "Звонки не прерываются",
};

function model(overrides: Partial<TrayModel> = {}): TrayModel {
  return {
    lang: "ru",
    accent: "violet",
    closeToTray: true,
    instances: [],
    playing: [],
    voice: null,
    incomingCall: null,
    updateVersion: null,
    labels,
    ...overrides,
  };
}

const outline = (entries: TrayMenuEntry[]): string[] =>
  entries.map((entry) => {
    if (entry.kind === "separator") return "---";
    if (entry.kind === "submenu") {
      return `${entry.label} > ${outline(entry.items).join(" | ")}`;
    }
    if (entry.kind === "check") {
      return `[${entry.checked ? "x" : " "}] ${entry.label}`;
    }
    if (entry.kind === "item" && entry.enabled === false) {
      return `(${entry.label})`;
    }
    return entry.label;
  });

describe("buildTrayMenu", () => {
  it("opens and quits even with nothing else to show", () => {
    expect(outline(buildTrayMenu(model()))).toEqual(["Открыть", "---", "Выйти"]);
  });

  it("launches recent instances and greys out the one already running", () => {
    const menu = buildTrayMenu(
      model({
        instances: [
          { name: "Survival", running: true },
          { name: "GreatJourney", running: false },
        ],
      }),
    );

    expect(outline(menu)).toEqual([
      "Открыть",
      "Играть > (Survival · запущена) | GreatJourney",
      "---",
      "Выйти",
    ]);
    const submenu = menu[1] as Extract<TrayMenuEntry, { kind: "submenu" }>;
    expect(submenu.items[1]).toMatchObject({
      command: { type: "launch", versionName: "GreatJourney" },
    });
  });

  it("puts an incoming call before the call in progress", () => {
    const menu = buildTrayMenu(
      model({
        incomingCall: { nickname: "Frumkin13" },
        voice: { title: "Друзья", muted: true, deafened: false, since: 0, participants: 2 },
      }),
    );

    expect(outline(menu)).toEqual([
      "Открыть",
      "---",
      "Входящий звонок: Frumkin13",
      "Принять",
      "Отклонить",
      "---",
      "Голос: Друзья",
      "[x] Выключить микрофон",
      "[ ] Выключить звук",
      "Покинуть звонок",
      "---",
      "Выйти",
    ]);
  });
});

describe("update in the tray", () => {
  it("offers the downloaded update right above quit", () => {
    expect(outline(buildTrayMenu(model({ updateVersion: "2.0.5" })))).toEqual([
      "Открыть",
      "---",
      "Обновить до 2.0.5",
      "Выйти",
    ]);
  });
});

describe("buildTrayTooltip", () => {
  it("says what is going on", () => {
    expect(
      buildTrayTooltip(
        model({
          playing: ["Survival"],
          voice: { title: "Frumkin13", muted: false, deafened: false, since: 0, participants: 2 },
        }),
        "Grubie Launcher",
      ),
    ).toBe("Grubie Launcher\nИграет: Survival\nГолос: Frumkin13");
  });

  it("stays within the Windows tooltip limit", () => {
    const long = buildTrayTooltip(
      model({ playing: ["x".repeat(200)] }),
      "Grubie Launcher",
    );
    expect(long.length).toBeLessThanOrEqual(127);
  });
});

describe("sanitizeTrayModel", () => {
  it("drops anything that is not part of the model", () => {
    const clean = sanitizeTrayModel({
      closeToTray: "yes",
      instances: [{ name: "Survival", running: 1 }, { name: "" }, null],
      playing: ["Survival", 5],
      voice: { title: "Room", muted: true, extra: "x" },
      incomingCall: null,
      labels: { ...labels, open: 42 },
    });

    expect(clean).toMatchObject({
      closeToTray: false,
      instances: [{ name: "Survival", running: false }],
      playing: ["Survival"],
      voice: { title: "Room", muted: true, deafened: false, since: 0, participants: 0 },
      incomingCall: null,
    });
    expect(clean?.labels.open).toBe("");
    expect(sanitizeTrayModel(null)).toBeNull();
  });
});
