import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import {
  consumeRenameOffer,
  renameOfferAtom,
  requestRenameOffer,
} from "./renameOffer";

describe("renameOffer", () => {
  beforeEach(() => {
    getDefaultStore().set(renameOfferAtom, null);
  });

  it("hands the suggested name to the matching instance once", () => {
    requestRenameOffer("C:/versions/Pack!", "Pack");

    expect(consumeRenameOffer("C:/versions/Other")).toBeNull();
    expect(consumeRenameOffer("C:/versions/Pack!")).toBe("Pack");
    expect(consumeRenameOffer("C:/versions/Pack!")).toBeNull();
  });

  it("ignores an empty key", () => {
    requestRenameOffer("", "Pack");
    expect(getDefaultStore().get(renameOfferAtom)).toBeNull();
  });
});
