import { describe, expect, it } from "vitest";

import en from "../../../locales/en.json";
import ru from "../../../locales/ru.json";
import uk from "../../../locales/uk.json";
import {
  getDeleteCopy,
  getDeleteGates,
  isForeignPublication,
  type DeleteGatesInput,
} from "./deleteGates";

function resolve(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      bundle,
    );
}

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

  it("flags a downloaded build as somebody else's publication", () => {
    const gates = getDeleteGates(
      input({
        owner: "microsoft_pashka4005",
        ownerId: "user-9",
        downloadedVersion: true,
      }),
    );

    expect(gates.foreignPublication).toBe(true);
  });

  it("still flags the publication when only the identity was recorded", () => {
    const gates = getDeleteGates(
      input({ owner: undefined, ownerId: "user-9", downloadedVersion: true }),
    );

    expect(gates.foreignPublication).toBe(true);
    expect(gates.publicationOwner).toBeNull();
  });

  it("leaves an own build unflagged", () => {
    expect(getDeleteGates(input()).foreignPublication).toBe(false);
  });
});

describe("isForeignPublication", () => {
  it("needs a share code, an account and an owner record", () => {
    const base = {
      shareCode: "code-1",
      owner: "discord_Bob",
      ownerId: "user-b",
      account: mine,
    };

    expect(isForeignPublication(base)).toBe(true);
    expect(isForeignPublication({ ...base, shareCode: undefined })).toBe(false);
    expect(isForeignPublication({ ...base, account: null })).toBe(false);
    expect(
      isForeignPublication({ ...base, owner: undefined, ownerId: undefined }),
    ).toBe(false);
  });
});

describe("getDeleteCopy", () => {
  it("keeps the plain wording for an own build", () => {
    const copy = getDeleteCopy({
      foreignPublication: false,
      publicationOwner: null,
    });

    expect(copy.titleKey).toBe("common.deletion");
    expect(copy.confirmKey).toBe("common.delete");
    expect(copy.ownerNoteKey).toBeNull();
  });

  it("calls a foreign build's removal what it is — a copy", () => {
    const copy = getDeleteCopy({
      foreignPublication: true,
      publicationOwner: { nickname: "AliceBuilds" },
    });

    expect(copy.titleKey).toBe("versions.deleteCopy.title");
    expect(copy.confirmKey).toBe("versions.deleteCopy.confirm");
    expect(copy.menuKey).toBe("versions.deleteCopy.menu");
    expect(copy.trashedKey).toBe("versions.deleteCopy.trashed");
    expect(copy.ownerNoteKey).toBe("versions.deleteBlocked.notOwner");
  });

  it("names the author generically when the nickname was never recorded", () => {
    const copy = getDeleteCopy({
      foreignPublication: true,
      publicationOwner: null,
    });

    expect(copy.ownerNoteKey).toBe("versions.deleteBlocked.notOwnerUnknown");
  });

  it("resolves every key in en, ru and uk", () => {
    const variants = [
      getDeleteCopy({ foreignPublication: false, publicationOwner: null }),
      getDeleteCopy({
        foreignPublication: true,
        publicationOwner: { nickname: "AliceBuilds" },
      }),
      getDeleteCopy({ foreignPublication: true, publicationOwner: null }),
    ];

    for (const bundle of [en, ru, uk]) {
      for (const copy of variants) {
        const keys = Object.values(copy).filter(
          (key): key is string => typeof key === "string",
        );

        for (const key of keys) {
          expect(typeof resolve(bundle, key), `${key} missing`).toBe("string");
        }
      }
    }
  });
});
