import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import {
  consumePublishOffer,
  publishOfferKeyAtom,
  requestPublishOffer,
} from "./publishOffer";

describe("publishOffer", () => {
  beforeEach(() => {
    getDefaultStore().set(publishOfferKeyAtom, null);
  });

  it("is consumed once by the requested key", () => {
    requestPublishOffer("C:/versions/Pack");

    expect(consumePublishOffer("C:/versions/Pack")).toBe(true);
    expect(consumePublishOffer("C:/versions/Pack")).toBe(false);
  });

  it("ignores other instances", () => {
    requestPublishOffer("C:/versions/Pack");

    expect(consumePublishOffer("C:/versions/Other")).toBe(false);
    expect(consumePublishOffer("C:/versions/Pack")).toBe(true);
  });

  it("ignores empty keys", () => {
    requestPublishOffer("");

    expect(getDefaultStore().get(publishOfferKeyAtom)).toBe(null);
    expect(consumePublishOffer("")).toBe(false);
  });
});
