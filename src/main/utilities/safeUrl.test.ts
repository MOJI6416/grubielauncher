import { describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("dns/promises", () => ({ default: { lookup } }));

import { isSafeRemoteFetchUrl, isSafeRemoteImageUrl } from "./safeUrl";

describe("isSafeRemoteImageUrl", () => {
  it("accepts public https avatar urls", () => {
    expect(
      isSafeRemoteImageUrl("https://api.grubielauncher.com/avatars/x.png"),
    ).toBe(true);
  });

  it("rejects plaintext http image urls", () => {
    expect(isSafeRemoteImageUrl("http://cdn.example.com/a.png")).toBe(false);
  });

  it("rejects loopback, private and link-local hosts (SSRF)", () => {
    expect(isSafeRemoteImageUrl("http://localhost/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://127.0.0.1:8080/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://10.0.0.5/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://192.168.1.1/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://172.16.0.1/x")).toBe(false);
    expect(
      isSafeRemoteImageUrl("http://169.254.169.254/latest/meta-data"),
    ).toBe(false);
  });

  it("rejects IPv6 loopback, unique-local and link-local hosts", () => {
    expect(isSafeRemoteImageUrl("http://[::1]/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://[::ffff:127.0.0.1]/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://[::ffff:7f00:1]/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://[fc00::1]/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://[fd12:3456::1]/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://[fe80::1]/x")).toBe(false);
    expect(isSafeRemoteImageUrl("http://cdn.localhost/a.png")).toBe(false);
    expect(isSafeRemoteImageUrl("https://[2606:4700::1111]/a.png")).toBe(true);
  });

  it("rejects non-http schemes and bad input", () => {
    expect(isSafeRemoteImageUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeRemoteImageUrl("data:image/png;base64,xxx")).toBe(false);
    expect(isSafeRemoteImageUrl("")).toBe(false);
    expect(isSafeRemoteImageUrl(undefined)).toBe(false);
  });
});

describe("isSafeRemoteFetchUrl", () => {
  it("accepts a host that resolves to public addresses only", async () => {
    lookup.mockResolvedValueOnce([{ address: "104.18.0.1", family: 4 }]);
    await expect(
      isSafeRemoteFetchUrl("https://cdn.grubielauncher.com/a.png"),
    ).resolves.toBe(true);
  });

  it("rejects a host that resolves to a private address (DNS rebinding)", async () => {
    lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(isSafeRemoteFetchUrl("https://evil.example/a.png")).resolves.toBe(
      false,
    );
  });

  it("rejects when any resolved address is private", async () => {
    lookup.mockResolvedValueOnce([
      { address: "104.18.0.1", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(isSafeRemoteFetchUrl("https://evil.example/a.png")).resolves.toBe(
      false,
    );
  });

  it("rejects when resolution fails or returns nothing", async () => {
    lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(isSafeRemoteFetchUrl("https://gone.example/a.png")).resolves.toBe(
      false,
    );

    lookup.mockResolvedValueOnce([]);
    await expect(isSafeRemoteFetchUrl("https://empty.example/a.png")).resolves.toBe(
      false,
    );
  });

  it("does not resolve literal IP hosts and keeps rejecting private ones", async () => {
    await expect(isSafeRemoteFetchUrl("https://8.8.8.8/a.png")).resolves.toBe(true);
    await expect(isSafeRemoteFetchUrl("https://127.0.0.1/a.png")).resolves.toBe(
      false,
    );
    expect(lookup).not.toHaveBeenCalledWith("8.8.8.8", expect.anything());
  });
});
