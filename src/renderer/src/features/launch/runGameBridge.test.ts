import { describe, expect, it } from "vitest";
import {
  countRunningConsoles,
  getGameRunner,
  registerGameRunner,
} from "./runGameBridge";

const console_ = (
  versionName: string,
  status: "running" | "stopped" | "error",
) => ({ versionName, status });

describe("countRunningConsoles", () => {
  it("counts only running consoles of the asked instance", () => {
    const consoles = [
      console_("Fabric 26.2", "running"),
      console_("Fabric 26.2", "stopped"),
      console_("Vanilla 26.2", "running"),
    ];

    expect(countRunningConsoles(consoles, "Fabric 26.2")).toBe(1);
    expect(countRunningConsoles(consoles, "Vanilla 26.2")).toBe(1);
    expect(countRunningConsoles(consoles, "MyModpack")).toBe(0);
  });

  it("counts every parallel session of the same instance", () => {
    const consoles = [
      console_("MyModpack", "running"),
      console_("MyModpack", "running"),
      console_("MyModpack", "error"),
    ];

    expect(countRunningConsoles(consoles, "MyModpack")).toBe(2);
  });
});

describe("registerGameRunner", () => {
  it("exposes the registered runner and clears it on dispose", () => {
    const runner = async () => {};

    const dispose = registerGameRunner(runner);
    expect(getGameRunner()).toBe(runner);

    dispose();
    expect(getGameRunner()).toBeNull();
  });

  it("keeps the newest runner when an older one disposes late", () => {
    const first = async () => {};
    const second = async () => {};

    const disposeFirst = registerGameRunner(first);
    registerGameRunner(second);
    disposeFirst();

    expect(getGameRunner()).toBe(second);
  });
});
