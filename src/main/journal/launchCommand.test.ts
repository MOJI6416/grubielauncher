import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  describeLaunchCommand,
  javaAgentPaths,
  maskLaunchArguments,
  splitLaunchCommand,
} from "./launchCommand";

describe("launch command description", () => {
  it("splits java, jvm and game arguments around the main class", () => {
    expect(
      splitLaunchCommand(
        ["java", "-Xmx4G", "net.minecraft.client.main.Main", "--version", "1.21"],
        "net.minecraft.client.main.Main",
      ),
    ).toEqual({
      java: "java",
      jvm: ["-Xmx4G"],
      game: ["--version", "1.21"],
    });
  });

  it("masks the access token and collapses the classpath", () => {
    const masked = maskLaunchArguments(
      ["-cp", "a.jar;b.jar", "--accessToken", "secret", "--username", "Steve"],
      ";",
    );

    expect(masked.args).toEqual([
      "-cp",
      "<2 entries>",
      "--accessToken",
      "<secret>",
      "--username",
      "Steve",
    ]);
    expect(masked.classpath).toEqual(["a.jar", "b.jar"]);
  });

  it("collapses prefetched authlib-injector metadata", () => {
    expect(
      maskLaunchArguments([
        "-Dauthlibinjector.yggdrasil.prefetched=eyJtZXRhIjp7fX0=",
        "-Xmx2G",
      ]).args,
    ).toEqual([
      "-Dauthlibinjector.yggdrasil.prefetched=<metadata>",
      "-Xmx2G",
    ]);
  });

  it("reads java agent paths with and without quotes", () => {
    expect(
      javaAgentPaths([
        "-javaagent:C:\\libs\\authlib-injector.jar=grubielauncher.com",
        '-javaagent:"C:\\my libs\\agent.jar"=ely.by',
      ]),
    ).toEqual(["C:\\libs\\authlib-injector.jar", "C:\\my libs\\agent.jar"]);
  });

  it("lists classpath entries that are missing on disk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
    const present = path.join(dir, "present.jar");
    const missing = path.join(dir, "missing.jar");
    fs.writeFileSync(present, "");

    try {
      const described = await describeLaunchCommand(
        [
          process.execPath,
          "-cp",
          [present, missing].join(path.delimiter),
          "Main",
          "--accessToken",
          "secret",
        ],
        "Main",
      );

      expect(described).toMatchObject({
        javaExists: true,
        classpathEntries: 2,
        missingCount: 1,
        missingFiles: [missing],
        gameArgs: ["--accessToken", "<secret>"],
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
