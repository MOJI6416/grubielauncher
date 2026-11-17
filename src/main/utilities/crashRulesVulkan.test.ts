import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CRASH_RULES,
  VULKAN_STARTUP_RULE_ID,
  describeUnsafePattern,
  isVulkanStartupCrash,
  matchCrashRules,
  vulkanStartupOutranks,
} from "./crashRules";

const STARTED_DIRTY = [
  "version:4671",
  'preferredGraphicsBackend:"default"',
  "startedCleanly:false",
].join("\n");

const STARTED_CLEAN = STARTED_DIRTY.replace(
  "startedCleanly:false",
  "startedCleanly:true",
);

const VULKAN_LOG = [
  "[12:00:01] [Render thread/INFO]: Backend library: LWJGL version 3.4.3",
  "[12:00:02] [Render thread/INFO]: Using graphics backend Vulkan, using drivers: NVIDIA 581.57",
  "[12:00:02] [Render thread/INFO]: Using graphics device: NVIDIA GeForce GTX 750 Ti (discrete)",
].join("\n");

const OPENGL_LOG = VULKAN_LOG.replace(
  "Using graphics backend Vulkan",
  "Using graphics backend OpenGL",
);

describe("vulkan startup crash", () => {
  it("is recognised when the game died before startup finished under Vulkan", () => {
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_DIRTY,
        logText: VULKAN_LOG,
        forcedBackend: null,
      }),
    ).toBe(true);
  });

  it("ignores a crash after the game had started cleanly", () => {
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_CLEAN,
        logText: VULKAN_LOG,
        forcedBackend: null,
      }),
    ).toBe(false);
  });

  it("ignores a startup crash that happened on OpenGL", () => {
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_DIRTY,
        logText: OPENGL_LOG,
        forcedBackend: "vulkan",
      }),
    ).toBe(false);
  });

  it("trusts the log over the forced choice when the backend was reported", () => {
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_DIRTY,
        logText:
          "Graphics backend forced to VULKAN by launch argument, in-game preferred graphics backend setting is ignored",
        forcedBackend: null,
      }),
    ).toBe(true);
  });

  it("falls back to the launcher choice or options.txt when the log stops early", () => {
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_DIRTY,
        logText: "[12:00:00] [main/INFO]: Setting user: Steve",
        forcedBackend: "vulkan",
      }),
    ).toBe(true);
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_DIRTY.replace('"default"', '"vulkan"'),
        logText: "",
        forcedBackend: null,
      }),
    ).toBe(true);
    expect(
      isVulkanStartupCrash({
        optionsText: STARTED_DIRTY,
        logText: "",
        forcedBackend: "opengl",
      }),
    ).toBe(false);
  });

  it("needs options.txt to tell a startup crash apart", () => {
    expect(
      isVulkanStartupCrash({
        optionsText: null,
        logText: VULKAN_LOG,
        forcedBackend: "vulkan",
      }),
    ).toBe(false);
  });

  it("takes over only the generic verdicts", () => {
    expect(vulkanStartupOutranks(null)).toBe(true);
    expect(vulkanStartupOutranks("native_crash")).toBe(true);
    expect(vulkanStartupOutranks("gl_error")).toBe(true);
    expect(vulkanStartupOutranks("mixin_error")).toBe(false);
    expect(vulkanStartupOutranks("out_of_memory")).toBe(false);
  });
});

describe("vulkan crash rule", () => {
  it("matches a crash inside the Vulkan backend", () => {
    const report = [
      "java.lang.IllegalStateException: vkQueueSubmit failed: VK_ERROR_DEVICE_LOST",
      "\tat com.mojang.renderpearl.backend.vulkan.VulkanDevice.submit(VulkanDevice.java:812)",
    ].join("\n");

    expect(matchCrashRules(report)?.ruleId).toBe(VULKAN_STARTUP_RULE_ID);
  });

  it("does not fire on an OpenGL crash", () => {
    expect(
      matchCrashRules("GLFW error 65543: WGL: OpenGL profile requested")?.ruleId,
    ).toBe("gl_error");
  });

  it("ships safe patterns and every language", () => {
    const rule = BUILT_IN_CRASH_RULES.find(
      (entry) => entry.id === VULKAN_STARTUP_RULE_ID,
    );
    expect(rule?.pattern && describeUnsafePattern(rule.pattern)).toBeNull();
    expect(Object.keys(rule?.messages ?? {}).sort()).toEqual(
      ["de", "en", "es", "fr", "pl", "pt", "ru", "tr", "uk"].sort(),
    );
  });
});

describe("duplicate mods rule", () => {
  it("reads the mod id from the Forge and the Fabric wording", () => {
    expect(
      matchCrashRules(
        "Found duplicate mods:\n\tMod ID: 'jei' from mod files: jei-1.jar, jei-2.jar",
      ),
    ).toMatchObject({ ruleId: "duplicate_mods", culprits: ["jei"] });
    expect(
      matchCrashRules(
        "net.fabricmc.loader.impl.discovery.ModResolutionException: duplicate mod sodium",
      ),
    ).toMatchObject({ ruleId: "duplicate_mods", culprits: ["sodium"] });
  });
});
