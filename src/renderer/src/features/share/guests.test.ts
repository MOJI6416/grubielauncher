import { describe, expect, it } from "vitest";
import type { SharePeerInfo } from "@/types/Share";
import {
  buildGuestRows,
  guestDisplayName,
  guestSecondaryName,
  guestUserIds,
} from "./guests";

function peer(patch: Partial<SharePeerInfo> & { streamId: number }): SharePeerInfo {
  return {
    peerIp: "10.0.0.1",
    peerPort: 40000 + patch.streamId,
    connectedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("buildGuestRows", () => {
  it("collapses several streams of one guest into a single row", () => {
    const rows = buildGuestRows(
      [
        peer({ streamId: 1, guestUserId: "u1", guestUsername: "Kituk" }),
        peer({
          streamId: 2,
          guestUserId: "u1",
          guestUsername: "Kituk",
          connectedAt: "2026-01-01T00:00:05.000Z",
        }),
      ],
      new Map([["u1", "Kituk"]]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].connections).toBe(2);
    expect(rows[0].connectedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("collapses anonymous guests by game nickname, case-insensitively", () => {
    const rows = buildGuestRows(
      [
        peer({ streamId: 1, guestUsername: "Steve" }),
        peer({ streamId: 2, guestUsername: "steve" }),
      ],
      new Map(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].connections).toBe(2);
  });

  it("keeps unidentified streams apart", () => {
    const rows = buildGuestRows(
      [peer({ streamId: 1 }), peer({ streamId: 2 })],
      new Map(),
    );

    expect(rows).toHaveLength(2);
  });

  it("orders guests by the moment they joined", () => {
    const rows = buildGuestRows(
      [
        peer({
          streamId: 2,
          guestUserId: "b",
          connectedAt: "2026-01-01T00:05:00.000Z",
        }),
        peer({
          streamId: 1,
          guestUserId: "a",
          connectedAt: "2026-01-01T00:01:00.000Z",
        }),
      ],
      new Map(),
    );

    expect(rows.map((row) => row.userId)).toEqual(["a", "b"]);
  });

  it("resolves account names from the friend list", () => {
    const rows = buildGuestRows(
      [peer({ streamId: 1, guestUserId: "u1", guestUsername: "OldNick" })],
      new Map([["u1", "moji6416"]]),
    );

    expect(rows[0].accountName).toBe("moji6416");
    expect(rows[0].isKnown).toBe(true);
    expect(guestDisplayName(rows[0], "?")).toBe("moji6416");
    expect(guestSecondaryName(rows[0])).toBe("OldNick");
  });

  it("hides a duplicate secondary name", () => {
    const rows = buildGuestRows(
      [peer({ streamId: 1, guestUserId: "u1", guestUsername: "moji6416" })],
      new Map([["u1", "moji6416"]]),
    );

    expect(guestSecondaryName(rows[0])).toBeUndefined();
  });

  it("falls back to the unknown label", () => {
    const rows = buildGuestRows([peer({ streamId: 7 })], new Map());
    expect(guestDisplayName(rows[0], "Гость")).toBe("Гость");
    expect(guestSecondaryName(rows[0])).toBeUndefined();
  });
});

describe("guestUserIds", () => {
  it("collects only identified guests", () => {
    const rows = buildGuestRows(
      [peer({ streamId: 1, guestUserId: "u1" }), peer({ streamId: 2 })],
      new Map(),
    );

    expect([...guestUserIds(rows)]).toEqual(["u1"]);
  });
});
