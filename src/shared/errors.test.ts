import { describe, expect, it } from "vitest";
import { classifyError } from "./errors";

function axiosError(status: number, url: string) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    config: { url },
    response: { status },
  };
}

describe("classifyError", () => {
  it("maps backend http errors to the grubie side", () => {
    const info = classifyError(
      axiosError(503, "https://api.grubielauncher.com/modpacks/abc"),
    );

    expect(info.side).toBe("grubie");
    expect(info.cause).toBe("serverError");
    expect(info.status).toBe(503);
    expect(info.code).toBe("GRB-503");
  });

  it("maps forgecdn 403 to curseforge", () => {
    const info = classifyError(
      axiosError(403, "https://mediafilez.forgecdn.net/files/1/2/mod.jar"),
    );

    expect(info.side).toBe("curseforge");
    expect(info.cause).toBe("forbidden");
    expect(info.code).toBe("CF-403");
  });

  it("treats dns failures as a network problem", () => {
    const info = classifyError({
      code: "ENOTFOUND",
      message: "getaddrinfo ENOTFOUND api.modrinth.com",
    });

    expect(info.side).toBe("network");
    expect(info.cause).toBe("dns");
    expect(info.code).toBe("NET-DNS");
  });

  it("detects a full disk", () => {
    const info = classifyError({
      code: "ENOSPC",
      message: "ENOSPC: no space left on device, write",
    });

    expect(info.side).toBe("disk");
    expect(info.cause).toBe("diskFull");
    expect(info.code).toBe("DISK-FULL");
  });

  it("detects busy files behind a plain string message", () => {
    const info = classifyError(
      "Error: EBUSY: resource busy or locked, unlink 'mods/test.jar'",
    );

    expect(info.side).toBe("disk");
    expect(info.cause).toBe("fileBusy");
  });

  it("detects a checksum mismatch", () => {
    const info = classifyError(
      new Error("Checksum mismatch for fabric-api.jar (expected sha1)"),
    );

    expect(info.cause).toBe("checksum");
  });

  it("detects blocked mods that require a manual download", () => {
    const info = classifyError(new Error("Manual download required"));

    expect(info.cause).toBe("blockedMod");
  });

  it("keeps cancellations recognizable", () => {
    expect(classifyError(new Error("AbortError")).cause).toBe("cancelled");
  });

  it("honours an explicit side from the context", () => {
    const info = classifyError(new Error("boom"), { side: "elyby" });

    expect(info.side).toBe("elyby");
    expect(info.code).toBe("ELY-UNKNOWN");
  });

  it("keeps the channel for later correlation", () => {
    const info = classifyError(new Error("boom"), {
      channel: "backend:getModpack",
    });

    expect(info.channel).toBe("backend:getModpack");
  });
});
