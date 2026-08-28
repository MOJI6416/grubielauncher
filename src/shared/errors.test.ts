import { describe, expect, it } from "vitest";
import {
  classifyError,
  isSourceUnreachable,
  isTransientNetworkFailure,
} from "./errors";

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

  it("keeps the reason the backend sent with a rejected request", () => {
    const error = axiosError(
      409,
      "https://api.grubielauncher.com/modpacks",
    ) as any;
    error.response.data = {
      statusCode: 409,
      message: "The modpack already exists",
    };

    const info = classifyError(error, { channel: "backend:shareModpack" });

    expect(info.code).toBe("GRB-409");
    expect(info.message).toBe(
      "Request failed with status code 409: The modpack already exists",
    );
  });

  it("ignores an html error page as a reason", () => {
    const error = axiosError(502, "https://api.grubielauncher.com/modpacks") as any;
    error.response.data = "<html><body>502 Bad Gateway</body></html>";

    const info = classifyError(error);

    expect(info.message).toBe("Request failed with status code 502");
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

  it("attributes a batch download failure to the host that actually failed", () => {
    const info = classifyError(
      new Error(
        "Failed to download 1 file(s): fabric.json from https://meta.fabricmc.net",
      ),
    );

    expect(info.side).toBe("loader");
  });

  it("treats a dropped connection as worth one more try", () => {
    expect(isTransientNetworkFailure({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientNetworkFailure({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientNetworkFailure({ code: "ERR_NETWORK" })).toBe(true);
  });

  it("never retries an answer the server actually gave", () => {
    expect(
      isTransientNetworkFailure({
        code: "ECONNRESET",
        response: { status: 409 },
      }),
    ).toBe(false);
    expect(isTransientNetworkFailure({ response: { status: 400 } })).toBe(false);
    expect(
      isTransientNetworkFailure({ code: "ENOTFOUND", response: { status: 404 } }),
    ).toBe(false);
    expect(isTransientNetworkFailure(new Error("boom"))).toBe(false);
    expect(isTransientNetworkFailure({ code: "ENOSPC" })).toBe(false);
  });

  it("separates an unreachable source from an honest empty answer", () => {
    expect(isSourceUnreachable({ isAxiosError: true, code: "ECONNREFUSED" })).toBe(
      true,
    );
    expect(isSourceUnreachable({ isAxiosError: true, code: "ENOTFOUND" })).toBe(true);
    expect(
      isSourceUnreachable({ isAxiosError: true, response: { status: 503 } }),
    ).toBe(true);
    expect(
      isSourceUnreachable({ isAxiosError: true, response: { status: 404 } }),
    ).toBe(false);
    expect(
      isSourceUnreachable({ isAxiosError: true, response: { status: 403 } }),
    ).toBe(false);
    expect(isSourceUnreachable(new Error("bad json"))).toBe(false);
  });

  it("keeps the channel for later correlation", () => {
    const info = classifyError(new Error("boom"), {
      channel: "backend:getModpack",
    });

    expect(info.channel).toBe("backend:getModpack");
  });
});
