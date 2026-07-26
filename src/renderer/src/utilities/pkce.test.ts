import { describe, expect, it } from "vitest";
import { createCodeChallenge, createCodeVerifier } from "./pkce";

describe("PKCE", () => {
  it("creates a verifier within the RFC 7636 length and alphabet", () => {
    const verifier = createCodeVerifier();

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("never repeats a verifier", () => {
    const values = new Set(
      Array.from({ length: 50 }, () => createCodeVerifier()),
    );

    expect(values.size).toBe(50);
  });

  it("derives a stable url-safe S256 challenge", async () => {
    const challenge = await createCodeChallenge("test-verifier");

    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).not.toContain("=");
    expect(await createCodeChallenge("test-verifier")).toBe(challenge);
  });

  it("produces a different challenge for a different verifier", async () => {
    const first = await createCodeChallenge(createCodeVerifier());
    const second = await createCodeChallenge(createCodeVerifier());

    expect(first).not.toBe(second);
  });

  it("matches the reference vector from RFC 7636", async () => {
    expect(
      await createCodeChallenge(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
