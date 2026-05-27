import { describe, expect, it } from "vitest";
import { shouldRenewGatewayToken } from "./shareClientLogic";

describe("share client logic", () => {
  it("renews missing or expired gateway tokens", () => {
    expect(shouldRenewGatewayToken(0, 1_000)).toBe(true);
    expect(shouldRenewGatewayToken(900, 1_000)).toBe(true);
  });

  it("renews gateway tokens before the reconnect safety window", () => {
    expect(shouldRenewGatewayToken(61_000, 1_000, 60_000)).toBe(true);
    expect(shouldRenewGatewayToken(62_000, 1_000, 60_000)).toBe(false);
  });
});
