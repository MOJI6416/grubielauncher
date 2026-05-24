import { describe, expect, it } from "vitest";
import {
  createLoaderInstallerProgressState,
  parseLoaderInstallerProgressLine,
} from "./loaderInstallerProgress";

function parseSequence(lines: string[]) {
  const state = createLoaderInstallerProgressState(38);
  return lines
    .map((line) =>
      parseLoaderInstallerProgressLine(line, state, {
        startPercent: 38,
        endPercent: 58,
      }),
    )
    .filter(Boolean);
}

describe("loader installer progress parser", () => {
  it("tracks the main Forge installer phases from real logs", () => {
    const updates = parseSequence([
      "java.net.preferIPv4Stack=true",
      "Extracting json",
      "Considering minecraft client jar",
      "  Downloading library from https://maven.minecraftforge.net/net/minecraftforge/binarypatcher.jar",
      "Downloading libraries",
      "Building Processors",
      "Task: DOWNLOAD_MOJMAPS",
      "  Patching net/minecraft/Util 1/1",
      "Injecting profile",
      "Successfully installed client into launcher.",
    ]);

    expect(updates.map((update) => update?.detailsKey)).toContain(
      "installationProgress.installerDetails.patching",
    );
    expect(updates.at(-1)?.progressPercent).toBe(58);
    expect(updates.at(-1)?.detailsKey).toBe(
      "installationProgress.installerDetails.completed",
    );

    const progress = updates.map((update) => update!.progressPercent);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("tracks NeoForge processor task names", () => {
    const updates = parseSequence([
      "Building Processor",
      "Processor: net.neoforged.installertools:installertools -> PROCESS_MINECRAFT_JAR",
      "Task: PROCESS_MINECRAFT_JAR",
    ]);

    expect(updates[1]?.detailsKey).toBe(
      "installationProgress.installerDetails.runningProcessor",
    );
    expect(updates[1]?.detailsParams?.item).toBe(
      "installertools -> PROCESS_MINECRAFT_JAR",
    );
    expect(updates[2]?.detailsParams?.item).toBe("PROCESS_MINECRAFT_JAR");
  });

  it("detects legacy Forge installer fallback when --installClient is unsupported", () => {
    const state = createLoaderInstallerProgressState(38);
    const update = parseLoaderInstallerProgressLine(
      "joptsimple.UnrecognizedOptionException: 'installClient' is not a recognized option",
      state,
    );

    expect(update?.detailsKey).toBe(
      "installationProgress.installerDetails.legacyFallback",
    );
    expect(update?.progressPercent).toBeGreaterThan(38);
  });

  it("does not treat unrelated library names as installer progress errors", () => {
    const state = createLoaderInstallerProgressState(38);
    const update = parseLoaderInstallerProgressLine(
      "Considering library com.google.errorprone:error_prone_annotations:2.41.0",
      state,
    );

    expect(update).toBeNull();
  });

  it("caps progress at the configured installer range", () => {
    const updates = parseSequence([
      ...Array.from({ length: 500 }, () => "  Patching net/minecraft/Util 1/1"),
      "Successfully installed client into launcher.",
    ]);

    expect(Math.max(...updates.map((update) => update!.progressPercent))).toBe(
      58,
    );
  });
});
