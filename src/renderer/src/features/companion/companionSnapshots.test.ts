import { describe, expect, it } from "vitest";
import type { IFriend } from "@/types/IFriend";
import type { IVoiceSessionState } from "@/types/Voice";
import { buildFriendsSnapshot, buildVoiceSnapshot, glfwKeyFor } from "./companionSnapshots";

function friend(id: string, nickname: string, extra: Partial<IFriend> = {}): IFriend {
  return {
    user: { _id: id, nickname, lastActive: new Date().toISOString() },
    isOnline: true,
    versionName: "",
    versionCode: "",
    serverAddress: "",
    ...extra,
  } as unknown as IFriend;
}

describe("companion snapshots", () => {
  it("maps push-to-talk keys to GLFW codes", () => {
    expect(glfwKeyFor({ type: "key", code: 47, label: "V" })).toBe(86);
    expect(glfwKeyFor({ type: "key", code: 2, label: "1" })).toBe(49);
    expect(glfwKeyFor({ type: "key", code: 65, label: "F7" })).toBe(296);
    expect(glfwKeyFor({ type: "key", code: 58, label: "CapsLock" })).toBe(280);
    expect(glfwKeyFor({ type: "key", code: 82, label: "Numpad0" })).toBe(320);
    expect(glfwKeyFor({ type: "mouse", code: 4, label: "Mouse4" })).toBeUndefined();
    expect(glfwKeyFor({ type: "key", code: 999, label: "Unknown" })).toBeUndefined();
    expect(glfwKeyFor(null)).toBeUndefined();
  });

  it("lists online friends first by who is playing and counts the rest", () => {
    const snapshot = buildFriendsSnapshot(
      [
        friend("a", "Zed"),
        friend("b", "Kituk", { versionName: "Island", serverAddress: "mc.example.net", versionCode: "ABCD" }),
        friend("c", "Offline", { isOnline: false }),
      ],
      [],
      "https://api.example.com",
    );
    expect(snapshot.offline).toBe(1);
    expect(snapshot.offlineList?.map((entry) => entry.name)).toEqual(["Offline"]);
    expect(snapshot.online.map((entry) => entry.name)).toEqual(["Kituk", "Zed"]);
    expect(snapshot.online[0]).toMatchObject({
      id: "b",
      status: "playing",
      activity: "Island · mc.example.net",
      joinable: true,
    });
    expect(snapshot.online[0].avatarUrl).toMatch(/^https:\/\/api\.example\.com\/skins\/head\/user\/b/);
    expect(buildFriendsSnapshot([friend("a", "Zed")], [], "http://localhost:3000").online[0].avatarUrl).toBeUndefined();
  });

  it("sends voice only while a room is live", () => {
    const base = {
      state: "connected",
      roomName: "Builders",
      participants: [
        { identity: "a", name: "Kituk", isLocal: false, isSpeaking: true, isMuted: false },
        { identity: "me", name: "Me", isLocal: true, isSpeaking: false, isMuted: true },
      ],
      isMicMuted: true,
      isDeafened: false,
      pttEnabled: true,
      pttBindLabel: "V",
    } as unknown as IVoiceSessionState;
    const live = buildVoiceSnapshot(base, { type: "key", code: 47, label: "V" }, "https://api.example.com");
    expect(live).toMatchObject({ active: true, channel: "Builders", muted: true, ptt: true, pttKey: "V", pttCode: 86 });
    expect(live.members.map((member) => [member.id, member.speaking, member.muted])).toEqual([
      ["a", true, false],
      ["me", false, true],
    ]);
    const idle = buildVoiceSnapshot({ ...base, state: "disconnected" }, null, "");
    expect(idle).toEqual({ active: false, muted: false, deafened: false, ptt: false, members: [] });
  });
});
