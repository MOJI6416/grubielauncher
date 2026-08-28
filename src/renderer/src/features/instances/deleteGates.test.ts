import { describe, expect, it } from "vitest";

import { getDeleteGates, type DeleteGatesInput } from "./deleteGates";

const mine = { type: "discord", nickname: "Alice", id: "user-a" } as never;

function input(overrides: Partial<DeleteGatesInput> = {}): DeleteGatesInput {
  return {
    shareCode: "code-1",
    downloadedVersion: false,
    owner: "discord_Alice",
    ownerId: "user-a",
    account: mine,
    shareDel: false,
    canRequestRemoteDelete: true,
    ...overrides,
  };
}

describe("getDeleteGates", () => {
  it("offers the publication takedown to the owner", () => {
    const gates = getDeleteGates(input());

    expect(gates.canOfferRemoteDelete).toBe(true);
    expect(gates.publicationOwner).toBeNull();
    expect(getDeleteGates(input({ shareDel: true })).canDeleteRemote).toBe(true);
  });

  it("never sends the takedown for a build owned by somebody else", () => {
    const gates = getDeleteGates(
      input({ owner: "discord_Bob", ownerId: "user-b", shareDel: true }),
    );

    expect(gates.canOfferRemoteDelete).toBe(false);
    expect(gates.canDeleteRemote).toBe(false);
    expect(gates.publicationOwner?.nickname).toBe("Bob");
  });

  it("names the author of a downloaded build instead of staying silent", () => {
    const gates = getDeleteGates(
      input({
        owner: "microsoft_pashka4005",
        ownerId: "user-9",
        downloadedVersion: true,
      }),
    );

    expect(gates.canOfferRemoteDelete).toBe(false);
    expect(gates.canDeleteRemote).toBe(false);
    expect(gates.publicationOwner?.nickname).toBe("pashka4005");
  });

  it("does not treat a same-nickname account as the owner", () => {
    const gates = getDeleteGates(
      input({
        ownerId: "user-b",
        account: { type: "discord", nickname: "Alice", id: "user-a" } as never,
        shareDel: true,
      }),
    );

    expect(gates.canOfferRemoteDelete).toBe(false);
    expect(gates.canDeleteRemote).toBe(false);
  });

  it("keeps the takedown for builds published before ownership was recorded", () => {
    const gates = getDeleteGates(
      input({ owner: undefined, ownerId: undefined, shareDel: true }),
    );

    expect(gates.canOfferRemoteDelete).toBe(true);
    expect(gates.canDeleteRemote).toBe(true);
    expect(gates.publicationOwner).toBeNull();
  });

  it("recognises the owner from the legacy account key alone", () => {
    const gates = getDeleteGates(input({ ownerId: undefined }));

    expect(gates.canOfferRemoteDelete).toBe(true);
    expect(gates.publicationOwner).toBeNull();
  });

  it("holds the takedown back while the remote call is unavailable", () => {
    const gates = getDeleteGates(
      input({ shareDel: true, canRequestRemoteDelete: false }),
    );

    expect(gates.canOfferRemoteDelete).toBe(true);
    expect(gates.canDeleteRemote).toBe(false);
  });

  it("offers nothing without an account", () => {
    const gates = getDeleteGates(input({ account: null, shareDel: true }));

    expect(gates.canOfferRemoteDelete).toBe(false);
    expect(gates.canDeleteRemote).toBe(false);
    expect(gates.publicationOwner).toBeNull();
  });
});
