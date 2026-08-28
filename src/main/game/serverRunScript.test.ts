import { afterEach, describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs-extra";

const fakeAppData = path.resolve("/fake/appdata");

vi.mock("electron", () => ({
  app: { on: vi.fn(), getPath: vi.fn(() => path.resolve("/fake/appdata")) },
}));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: null,
  setRunningServersProbe: vi.fn(),
}));

import { AIKAR_FLAGS } from "../utilities/serverManager";
import {
  expandServerArgfiles,
  filterArgfileTokens,
  isLoaderManagedJvmArgument,
  isTrustedServerJavaCommand,
  parseRunScript,
  resolveRunScriptJava,
  tokenizeArgfileContent,
  tokenizeRunScriptLine,
} from "./Server";

const managedJava = path.join(
  fakeAppData,
  ".grubielauncher",
  "java",
  "jdk-21.0.5+11",
  "bin",
  process.platform === "win32" ? "java.exe" : "java",
);

describe("tokenizeRunScriptLine", () => {
  it("keeps a quoted Windows java path in one token", () => {
    expect(
      tokenizeRunScriptLine(
        `"C:\\Program Files\\java.exe" -Xmx4096M -jar server.jar nogui`,
        false,
      ),
    ).toEqual([
      "C:\\Program Files\\java.exe",
      "-Xmx4096M",
      "-jar",
      "server.jar",
      "nogui",
    ]);
  });

  it("unwraps the shell single-quote escape of an apostrophe", () => {
    expect(
      tokenizeRunScriptLine(`'/home/o'\\''brien/java' -jar server.jar`, true),
    ).toEqual(["/home/o'brien/java", "-jar", "server.jar"]);
  });
});

describe("parseRunScript", () => {
  it("reads the launcher generated run.bat", () => {
    const script = [
      "@echo off",
      `"C:\\java\\bin\\java.exe"  -Xmx4096M -jar fabric.jar nogui`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(script, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: ["-Xmx4096M", "-jar", "fabric.jar", "nogui"],
    });
  });

  it("reads a patched forge run.bat with argfiles and drops the %* passthrough", () => {
    const script = [
      "@echo off",
      `"C:\\java\\bin\\java.exe" @user_jvm_args.txt @libraries/net/neoforged/args.txt nogui %*`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(script, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: [
        "@user_jvm_args.txt",
        "@libraries/net/neoforged/args.txt",
        "nogui",
      ],
    });
  });

  it("reads run.sh without tripping on the shebang or the trailing read", () => {
    const script = [
      "#!/bin/sh",
      `'/opt/java/bin/java' -Xmx2048M -jar forge.jar nogui "$@"`,
      `read -p "Press [Enter] key to continue..."`,
    ].join("\n");

    expect(parseRunScript(script, true)).toEqual({
      command: "/opt/java/bin/java",
      args: ["-Xmx2048M", "-jar", "forge.jar", "nogui"],
    });
  });

  it("keeps every argument the launcher writes into run.bat", () => {
    const script = [
      "@echo off",
      `"C:\\java\\bin\\java.exe" -Dhttp.agent=Mozilla/5.0 -Xms4096M -Xmx4096M -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -Dusing.aikars.flags=https://mcflags.emc.gs -jar fabric.jar nogui`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(script, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: [
        "-Dhttp.agent=Mozilla/5.0",
        "-Xms4096M",
        "-Xmx4096M",
        "-XX:+UseG1GC",
        "-XX:MaxGCPauseMillis=200",
        "-Dusing.aikars.flags=https://mcflags.emc.gs",
        "-jar",
        "fabric.jar",
        "nogui",
      ],
    });
  });

  it("returns null when no java invocation can be recognised", () => {
    expect(parseRunScript("@echo off\npause", false)).toBeNull();
  });

  it("refuses to hand back anything but a java executable", () => {
    const hijacked = [
      "@echo off",
      `"C:\\Windows\\System32\\cmd.exe" /c evil.bat -jar server.jar`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(hijacked, false)).toBeNull();
  });

  it("drops injected jvm arguments while keeping the loader argfiles", () => {
    const tampered = [
      "@echo off",
      `"C:\\java\\bin\\java.exe" -javaagent:payload.jar -XX:VMOptionsFile=opts.txt @user_jvm_args.txt @libraries/net/neoforged/args.txt -Xmx4096M -jar forge.jar nogui`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(tampered, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: [
        "@user_jvm_args.txt",
        "@libraries/net/neoforged/args.txt",
        "-Xmx4096M",
        "-jar",
        "forge.jar",
        "nogui",
      ],
    });
  });

  it("keeps the authlib agent the launcher writes into a fabric run.bat", () => {
    const script = [
      "@echo off",
      `"C:\\java\\bin\\java.exe" -Dhttp.agent=Mozilla/5.0 -javaagent:"libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar"=ely.by  -Xmx4096M -jar fabric.jar nogui`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(script, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: [
        "-Dhttp.agent=Mozilla/5.0",
        "-javaagent:libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar=ely.by",
        "-Xmx4096M",
        "-jar",
        "fabric.jar",
        "nogui",
      ],
    });
  });

  it("keeps the authlib agent out of a run.sh only when it is the launcher's own", () => {
    const script = [
      "#!/bin/sh",
      `'/opt/java/bin/java' -javaagent:"libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar"=grubielauncher.com -javaagent:"libraries/evil.jar"=evil.com -Xmx2048M -jar quilt.jar nogui "$@"`,
      `read -p "Press [Enter] key to continue..."`,
    ].join("\n");

    expect(parseRunScript(script, true)).toEqual({
      command: "/opt/java/bin/java",
      args: [
        "-javaagent:libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar=grubielauncher.com",
        "-Xmx2048M",
        "-jar",
        "quilt.jar",
        "nogui",
      ],
    });
  });

  it("drops every java agent that is not the launcher's own injector", () => {
    const tampered = [
      "@echo off",
      `"C:\\java\\bin\\java.exe" -javaagent:C:/payload/evil.jar=ely.by -javaagent:libraries/../evil.jar=ely.by -javaagent:mods/evil.jar=ely.by -javaagent:libraries/authlib-injector-1.2.7.jar=evil.com -javaagent:libraries/authlib-injector-1.2.7.jar -javaagent:payload.jar -Xmx4096M -jar fabric.jar nogui`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(tampered, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: ["-Xmx4096M", "-jar", "fabric.jar", "nogui"],
    });
  });

  it("drops an argfile that is not one the launcher writes", () => {
    const tampered = [
      "@echo off",
      `"C:\\java\\bin\\java.exe" @evil.txt @libraries/../evil.txt -jar forge.jar nogui`,
      "pause",
    ].join("\r\n");

    expect(parseRunScript(tampered, false)).toEqual({
      command: "C:\\java\\bin\\java.exe",
      args: ["-jar", "forge.jar", "nogui"],
    });
  });
});

describe("isLoaderManagedJvmArgument", () => {
  it("keeps the launcher agent whatever case the authlib path arrives in", () => {
    for (const token of [
      "-javaagent:libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar=ely.by",
      "-javaagent:libraries/com/GitHub/YuShijinhun/Authlib-Injector/1.2.7/Authlib-Injector-1.2.7.JAR=ely.by",
      "-javaagent:LIBRARIES/authlib-injector-1.2.7.Jar=Ely.By",
      "-javaagent:libraries/authlib-injector-1.2.7.jar=GrubieLauncher.COM",
    ]) {
      expect(isLoaderManagedJvmArgument(token)).toBe(true);
    }
  });

  it("still refuses a look-alike auth server, a traversal or a foreign agent", () => {
    for (const token of [
      "-javaagent:libraries/authlib-injector-1.2.7.jar=ely.by.evil.com",
      "-javaagent:libraries/authlib-injector-1.2.7.JAR=ELY.BY.EVIL.COM",
      "-javaagent:libraries/authlib-injector-1.2.7.jar=evil.ely.by",
      "-javaagent:libraries/authlib-injector-1.2.7.jar=grubielauncher.com.evil.com",
      "-javaagent:libraries/../evil.jar=ely.by",
      "-javaagent:LIBRARIES/../evil.JAR=ELY.BY",
      "-javaagent:mods/evil.jar=ely.by",
      "-javaagent:C:/payload/evil.jar=ely.by",
      "-javaagent:libraries/authlib-injector-1.2.7.jar",
      "-JavaAgent:libraries/authlib-injector-1.2.7.jar=ely.by",
    ]) {
      expect(isLoaderManagedJvmArgument(token)).toBe(false);
    }
  });
});

describe("isTrustedServerJavaCommand", () => {
  it("accepts the java runtime the launcher installed", () => {
    expect(isTrustedServerJavaCommand(managedJava, "")).toBe(true);
  });

  it("accepts the java the launcher would pick right now", () => {
    const systemJava = path.resolve("/opt/java/bin/java");
    expect(isTrustedServerJavaCommand(systemJava, systemJava)).toBe(true);
  });

  it("refuses a bare command name that would be looked up in the server folder", () => {
    expect(isTrustedServerJavaCommand("java", "java")).toBe(false);
    expect(isTrustedServerJavaCommand("java.exe", "java.exe")).toBe(false);
    expect(isTrustedServerJavaCommand("javaw", "javaw")).toBe(false);
    expect(
      isTrustedServerJavaCommand(
        path.join(".", "java.exe"),
        path.join(".", "java.exe"),
      ),
    ).toBe(false);
    expect(
      isTrustedServerJavaCommand("java", path.resolve("/opt/java/bin/java")),
    ).toBe(false);
  });

  it("refuses a java-named binary dropped straight into the java folder", () => {
    const javaRoot = path.join(fakeAppData, ".grubielauncher", "java");

    expect(isTrustedServerJavaCommand(path.join(javaRoot, "java.exe"), "")).toBe(
      false,
    );
    expect(isTrustedServerJavaCommand(path.join(javaRoot, "java"), "")).toBe(
      false,
    );
    expect(
      isTrustedServerJavaCommand(path.join(javaRoot, "bin", "java.exe"), ""),
    ).toBe(false);
  });

  it("refuses a java-named binary from anywhere else", () => {
    expect(
      isTrustedServerJavaCommand(
        path.resolve("/tmp/payload/java"),
        path.resolve("/opt/java/bin/java"),
      ),
    ).toBe(false);
    expect(isTrustedServerJavaCommand(path.resolve("/tmp/java"), "")).toBe(false);
  });

  it("refuses anything that is not a java executable", () => {
    expect(
      isTrustedServerJavaCommand(
        path.join(path.dirname(managedJava), "cmd.exe"),
        "",
      ),
    ).toBe(false);
  });
});

const NEOFORGE_ARGS = [
  "-p libraries/cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar;libraries/net/fabricmc/sponge-mixin/0.15.2+mixin.0.8.7/sponge-mixin-0.15.2+mixin.0.8.7.jar",
  "--add-modules ALL-MODULE-PATH",
  "--add-opens java.base/java.util.jar=cpw.mods.securejarhandler",
  "--add-exports jdk.naming.dns/com.sun.jndi.dns=java.naming",
  "-Djava.net.preferIPv6Addresses=system",
  "-DignoreList=bootstraplauncher-2.0.2.jar,asm-9.8.jar",
  "-Dfml.pluginLayerLibraries=",
  "-DlibraryDirectory=libraries",
  "-DlegacyClassPath=libraries/net/neoforged/bus/8.0.5/bus-8.0.5.jar;libraries/org/ow2/asm/asm/9.8/asm-9.8.jar",
  "cpw.mods.bootstraplauncher.BootstrapLauncher",
  "--launchTarget forgeserver",
  "--fml.neoForgeVersion 21.1.235",
].join("\n");

describe("filterArgfileTokens", () => {
  it("keeps every argument a real neoforge argfile needs", () => {
    const tokens = tokenizeArgfileContent(NEOFORGE_ARGS);
    const { safe, rejected } = filterArgfileTokens(tokens);

    expect(rejected).toEqual([]);
    expect(safe).toEqual(tokens);
  });

  it("keeps the authlib agent the launcher writes into user_jvm_args.txt", () => {
    const line =
      '-Dhttp.agent=Mozilla/5.0 -javaagent:"libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar"=grubielauncher.com -Xmx4096M';

    const { safe, rejected } = filterArgfileTokens(
      tokenizeArgfileContent(line),
    );

    expect(rejected).toEqual([]);
    expect(safe).toEqual([
      "-Dhttp.agent=Mozilla/5.0",
      "-javaagent:libraries/com/github/yushijinhun/authlib-injector/1.2.7/authlib-injector-1.2.7.jar=grubielauncher.com",
      "-Xmx4096M",
    ]);
  });

  it("keeps the aikar line the launcher writes for a tuned server", () => {
    const line = `-Xms4096M -Xmx4096M ${AIKAR_FLAGS}`;
    const tokens = tokenizeArgfileContent(line);

    expect(filterArgfileTokens(tokens)).toEqual({ safe: tokens, rejected: [] });
  });

  it("drops jvm arguments injected into a loader argfile", () => {
    const tampered = [
      "-javaagent:payload.jar",
      "-javaagent:C:/payload/evil.jar=grubielauncher.com",
      "-agentpath:C:/payload/evil.dll",
      "-agentlib:evil",
      "-XX:VMOptionsFile=opts.txt",
      "-Xbootclasspath/a:payload.jar",
      "-XX:OnOutOfMemoryError=calc.exe",
      "-Djava.library.path=payload",
      "-DlegacyClassPath=C:/payload/evil.jar",
      "-p /etc/payload.jar",
      "@nested.txt",
      "-DlibraryDirectory=libraries",
    ].join("\n");

    const { safe, rejected } = filterArgfileTokens(
      tokenizeArgfileContent(tampered),
    );

    expect(safe).toEqual(["-DlibraryDirectory=libraries"]);
    expect(rejected).toContain("-javaagent:payload.jar");
    expect(rejected).toContain("-agentpath:C:/payload/evil.dll");
    expect(rejected).toContain("-XX:VMOptionsFile=opts.txt");
    expect(rejected).toContain("-Xbootclasspath/a:payload.jar");
    expect(rejected).toContain("@nested.txt");
    expect(rejected).toContain("/etc/payload.jar");
  });

  it("keeps filtering jvm arguments placed after the main class", () => {
    const { safe, rejected } = filterArgfileTokens(
      tokenizeArgfileContent(
        ["evil.Main", "-javaagent:payload.jar", "--launchTarget forgeserver"].join(
          "\n",
        ),
      ),
    );

    expect(safe).toEqual(["evil.Main", "--launchTarget", "forgeserver"]);
    expect(rejected).toEqual(["-javaagent:payload.jar"]);
  });
});

describe("expandServerArgfiles", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
  });

  const makeServer = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-argfile-"));
    roots.push(root);
    return root;
  };

  it("expands the launcher argfiles instead of letting java read them", async () => {
    const server = await makeServer();
    await fs.outputFile(
      path.join(server, "user_jvm_args.txt"),
      "-Xmx4096M\n# a comment\n",
    );
    await fs.outputFile(
      path.join(server, "libraries", "net", "neoforged", "win_args.txt"),
      NEOFORGE_ARGS,
    );

    const expanded = await expandServerArgfiles(server, [
      "@user_jvm_args.txt",
      "@libraries/net/neoforged/win_args.txt",
      "nogui",
    ]);

    expect(expanded[0]).toBe("-Xmx4096M");
    expect(expanded).toContain("cpw.mods.bootstraplauncher.BootstrapLauncher");
    expect(expanded.at(-1)).toBe("nogui");
    expect(expanded.some((arg) => arg.startsWith("@"))).toBe(false);
  });

  it("filters an argfile swapped in through server-overrides", async () => {
    const server = await makeServer();
    const argfile = path.join(
      server,
      "libraries",
      "net",
      "neoforged",
      "neoforge",
      "21.1.235",
      "win_args.txt",
    );
    await fs.outputFile(
      argfile,
      [
        "-javaagent:C:/payload/evil.jar",
        "-XX:VMOptionsFile=C:/payload/opts.txt",
        "-Xbootclasspath/a:C:/payload/evil.jar",
        "-DlibraryDirectory=libraries",
        "cpw.mods.bootstraplauncher.BootstrapLauncher",
      ].join("\r\n"),
    );

    const expanded = await expandServerArgfiles(server, [
      "@libraries/net/neoforged/neoforge/21.1.235/win_args.txt",
    ]);

    expect(expanded).toEqual([
      "-DlibraryDirectory=libraries",
      "cpw.mods.bootstraplauncher.BootstrapLauncher",
    ]);
  });

  it("drops an argfile reference that escapes the server folder", async () => {
    const server = await makeServer();
    await fs.outputFile(path.join(server, "evil.txt"), "-javaagent:evil.jar");

    await expect(
      expandServerArgfiles(server, ["@../evil.txt", "@evil.txt"]),
    ).resolves.toEqual([]);
  });
});

describe("resolveRunScriptJava", () => {
  it("keeps the run script command when the launcher still manages it", () => {
    expect(resolveRunScriptJava(managedJava, "")).toEqual({
      command: managedJava,
      repointedFrom: null,
    });
  });

  it("repoints a server installed with a system java that is gone", () => {
    const oldSystemJava = path.resolve("/opt/jdk-21.0.5/bin/java");

    expect(resolveRunScriptJava(oldSystemJava, managedJava)).toEqual({
      command: managedJava,
      repointedFrom: oldSystemJava,
    });
  });

  it("gives up only when there is no java to run at all", () => {
    expect(resolveRunScriptJava(path.resolve("/opt/gone/bin/java"), "")).toBe(
      null,
    );
  });
});
