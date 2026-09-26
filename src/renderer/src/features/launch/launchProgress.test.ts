import { describe, expect, it } from "vitest";
import {
  LaunchProgress,
  advanceStage,
  applyGameOutput,
  planLaunchStages,
  readLoaderSignal,
} from "./launchProgress";

function progress(overrides?: Partial<LaunchProgress>): LaunchProgress {
  return {
    versionName: "Survival",
    instance: 1,
    plan: planLaunchStages({
      checksAccount: true,
      checksModpack: false,
      modded: true,
    }),
    stage: "prepare",
    startedAt: 0,
    mods: null,
    ...overrides,
  };
}

describe("planLaunchStages", () => {
  it("lists only the stages that will actually happen", () => {
    expect(
      planLaunchStages({ checksAccount: false, checksModpack: false, modded: false }),
    ).toEqual(["prepare", "java"]);
    expect(
      planLaunchStages({ checksAccount: true, checksModpack: true, modded: true }),
    ).toEqual(["account", "modpack", "prepare", "java", "loader"]);
  });
});

describe("readLoaderSignal", () => {
  it("reads the Fabric mod count", () => {
    expect(readLoaderSignal("[22:56:42] [main/INFO]: Loading 68 mods:")).toEqual({
      mods: 68,
    });
  });

  it("finds the count inside a merged multi-line chunk", () => {
    const chunk = [
      "[22:56:42] [main/INFO]: Loading Minecraft 26.3 with Fabric Loader 0.19.5",
      "[22:56:42] [main/INFO]: Mappings not present!",
      "[22:56:42] [main/INFO]: Loading 142 mods:",
    ].join("\n");
    expect(readLoaderSignal(chunk)).toEqual({ mods: 142 });
  });

  it("recognises Forge and NeoForge bootstrap lines without a count", () => {
    expect(
      readLoaderSignal(
        "[main/INFO] [cpw.mods.modlauncher.Launcher/MODLAUNCHER]: ModLauncher running: args",
      ),
    ).toEqual({ mods: null });
    expect(
      readLoaderSignal(
        "[main/INFO] [net.neoforged.fml.loading.FMLLoader/CORE]: Starting",
      ),
    ).toEqual({ mods: null });
  });

  it("ignores unrelated output", () => {
    expect(readLoaderSignal("[main/INFO]: Datafixer optimizations")).toBeNull();
  });
});

describe("advanceStage", () => {
  it("never moves backwards", () => {
    const current = progress({ stage: "loader" });
    expect(advanceStage(current, "java")).toBe(current);
  });

  it("ignores stages outside the plan", () => {
    const current = progress();
    expect(advanceStage(current, "modpack")).toBe(current);
  });
});

describe("applyGameOutput", () => {
  it("treats the first output as the JVM being up", () => {
    expect(applyGameOutput(progress(), "Picked up JAVA_TOOL_OPTIONS").stage).toBe(
      "java",
    );
  });

  it("jumps to the loader stage and keeps the mod count", () => {
    const next = applyGameOutput(progress(), "[main/INFO]: Loading 68 mods:");
    expect(next.stage).toBe("loader");
    expect(next.mods).toBe(68);
  });

  it("stays on java for vanilla even when a loader-looking line appears", () => {
    const vanilla = progress({
      plan: planLaunchStages({
        checksAccount: false,
        checksModpack: false,
        modded: false,
      }),
    });
    expect(applyGameOutput(vanilla, "Loading 3 mods").stage).toBe("java");
  });

  it("returns the same object when nothing changes", () => {
    const current = progress({ stage: "loader", mods: 68 });
    expect(applyGameOutput(current, "[main/INFO]: Loading 68 mods:")).toBe(current);
  });
});
