import { describe, expect, it } from "vitest";
import { INITIAL_VOICE_CALL } from "@/types/Voice";
import type { TrayLabels } from "@/types/Tray";
import { buildTrayModel } from "./trayModel";

const labels = { open: "Open" } as TrayLabels;

const idle = {
  state: "disconnected" as const,
  roomId: "",
  roomName: "",
  isMicMuted: false,
  isDeafened: false,
  connectedAt: 0,
  participantCount: 0,
};

const base = {
  lang: "ru",
  accent: "violet",
  instances: [],
  running: [],
  session: idle,
  call: INITIAL_VOICE_CALL,
  groupNames: new Map<string, string>(),
  closeToTray: true,
  labels,
};

describe("buildTrayModel", () => {
  it("offers the most recently played installed instances with their art", () => {
    const model = buildTrayModel({
      ...base,
      instances: [
        { name: "Old", installed: true, lastLaunch: "2026-01-01T00:00:00Z" },
        {
          name: "Fresh",
          installed: true,
          lastLaunch: "2026-09-20T00:00:00Z",
          image: "file:///C:/logo.png",
          minecraft: "1.21.1",
          loader: "neoforge",
        },
        { name: "Broken", installed: false, lastLaunch: "2026-09-25T00:00:00Z" },
        { name: "Never", installed: true },
      ],
      running: ["Old", "Old"],
    });

    expect(model.instances).toEqual([
      {
        name: "Fresh",
        running: false,
        image: "file:///C:/logo.png",
        minecraft: "1.21.1",
        loader: "neoforge",
      },
      { name: "Old", running: true },
      { name: "Never", running: false },
    ]);
    expect(model.playing).toEqual(["Old"]);
    expect(model.voice).toBeNull();
    expect(model.updateVersion).toBeNull();
  });

  it("names a group call after the group and a direct call after the friend", () => {
    const groups = new Map([["group-1", "Друзья"]]);

    expect(
      buildTrayModel({
        ...base,
        groupNames: groups,
        session: {
          state: "connected",
          roomId: "group-1",
          roomName: "group-1",
          isMicMuted: true,
          isDeafened: false,
          connectedAt: 1000,
          participantCount: 3,
        },
      }).voice,
    ).toEqual({
      title: "Друзья",
      muted: true,
      deafened: false,
      since: 1000,
      participants: 3,
    });

    expect(
      buildTrayModel({
        ...base,
        session: {
          state: "reconnecting",
          roomId: "dm_a_b",
          roomName: "Frumkin13",
          isMicMuted: false,
          isDeafened: true,
          connectedAt: 5,
          participantCount: 2,
        },
      }).voice?.title,
    ).toBe("Frumkin13");
  });

  it("surfaces only a ringing incoming call", () => {
    const peer = { _id: "1", nickname: "Frumkin13" };

    expect(
      buildTrayModel({
        ...base,
        call: { status: "incoming", callId: "c", peer },
      }).incomingCall,
    ).toEqual({ nickname: "Frumkin13" });
    expect(
      buildTrayModel({
        ...base,
        call: { status: "outgoing", callId: "c", peer },
      }).incomingCall,
    ).toBeNull();
  });

  it("carries a downloaded update", () => {
    expect(buildTrayModel({ ...base, updateVersion: "2.0.5" }).updateVersion).toBe(
      "2.0.5",
    );
  });
});
