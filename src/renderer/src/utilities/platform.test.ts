import { describe, expect, it } from "vitest";
import { platformName } from "./platform";

describe("platformName", () => {
  it("maps node platforms to human names", () => {
    expect(platformName("win32")).toBe("Windows");
    expect(platformName("darwin")).toBe("macOS");
    expect(platformName("linux")).toBe("Linux");
  });

  it("passes unknown platforms through", () => {
    expect(platformName("freebsd")).toBe("freebsd");
  });
});
