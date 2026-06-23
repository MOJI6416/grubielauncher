import { describe, expect, it } from "vitest";
import { isSafeRemoteImageUrl } from "./safeUrl";

describe("isSafeRemoteImageUrl", () => {
  it("accepts public http(s) avatar urls", () => {
    expect(
      isSafeRemoteImageUrl("https://api.grubielauncher.com/avatars/x.png"),
    ).toBe(true);
    expect(isSafeRemoteImageUrl("http://cdn.example.com/a.png")).toBe(true);
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

  it("rejects non-http schemes and bad input", () => {
    expect(isSafeRemoteImageUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeRemoteImageUrl("data:image/png;base64,xxx")).toBe(false);
    expect(isSafeRemoteImageUrl("")).toBe(false);
    expect(isSafeRemoteImageUrl(undefined)).toBe(false);
  });
});
