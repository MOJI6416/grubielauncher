import { describe, expect, it } from "vitest";
import {
  filterRunArguments,
  isAllowedGameArgument,
  isAllowedJvmArgument,
} from "./runArguments";

const AIKAR_FLAGS = [
  "-Xms10G",
  "-Xmx10G",
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=200",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+DisableExplicitGC",
  "-XX:+AlwaysPreTouch",
  "-XX:G1NewSizePercent=30",
  "-XX:G1MaxNewSizePercent=40",
  "-XX:G1HeapRegionSize=8M",
  "-XX:G1ReservePercent=20",
  "-XX:G1HeapWastePercent=5",
  "-XX:G1MixedGCCountTarget=4",
  "-XX:InitiatingHeapOccupancyPercent=15",
  "-XX:G1MixedGCLiveThresholdPercent=90",
  "-XX:G1RSetUpdatingPauseTimePercent=5",
  "-XX:SurvivorRatio=32",
  "-XX:+PerfDisableSharedMem",
  "-XX:MaxTenuringThreshold=1",
  "-Dusing.aikars.flags=https://mcflags.emc.gs",
  "-Daikars.new.flags=true",
];

describe("isAllowedJvmArgument", () => {
  it("keeps memory and stack sizing", () => {
    for (const arg of [
      "-Xmx4G",
      "-Xms1024M",
      "-Xmn128m",
      "-Xss1M",
      "-Xmx4096",
      "-Xmx8g",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(true);
    }
  });

  it("keeps boolean and numeric vm options", () => {
    for (const arg of [
      "-XX:+UseG1GC",
      "-XX:-OmitStackTraceInFastThrow",
      "-XX:+UseZGC",
      "-XX:MaxRAMPercentage=75",
      "-XX:MaxRAMPercentage=62.5",
      "-XX:ReservedCodeCacheSize=400M",
      "-XX:ThreadPriorityPolicy=1",
      "-XX:ShenandoahGCHeuristics=compact",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(true);
    }
  });

  it("keeps the module flags real modpacks depend on", () => {
    for (const arg of [
      "--add-opens=java.base/java.lang=ALL-UNNAMED",
      "--add-opens=java.base/java.util=ALL-UNNAMED",
      "--add-exports=java.base/sun.nio.ch=ALL-UNNAMED",
      "--add-modules=jdk.incubator.vector",
      "--add-reads=java.base=ALL-UNNAMED",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(true);
    }
  });

  it("keeps harmless system properties", () => {
    for (const arg of [
      "-Dfml.ignoreInvalidMinecraftCertificates=true",
      "-Dfml.ignorePatchDiscrepancies=true",
      "-Dfile.encoding=UTF-8",
      "-Dsun.stdout.encoding=UTF-8",
      "-Djava.net.preferIPv4Stack=true",
      "-Dorg.lwjgl.util.Debug=true",
      "-Dlog4j2.formatMsgNoLookups=true",
      "-Dfabric.debug=true",
      "-Dhttp.agent=Mozilla/5.0",
      "-Dminecraft.api.env=custom",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(true);
    }
  });

  it("lets the whole Aikar set through", () => {
    for (const arg of AIKAR_FLAGS) {
      expect(isAllowedJvmArgument(arg)).toBe(true);
    }

    expect(filterRunArguments(AIKAR_FLAGS, "jvm")).toEqual({
      safe: AIKAR_FLAGS,
      rejected: [],
    });
  });

  it("rejects unified logging in every shape, not just file=", () => {
    for (const arg of [
      "-Xlog:gc:pwn.txt",
      "-Xlog:gc:C:\\Users\\x\\pwn.txt",
      "-Xlog:gc*:file=logs/gc.log",
      "-xlog:all=debug:FILE=out.txt",
      "-Xlog:gc",
      "-Xlog:gc*",
      "-Xlog:disable",
      "-Xlog:gc:stdout:filecount=5",
      "-Xloggc:pwn.txt",
      "-Xloggc:/tmp/pwn",
      "-XloGGC:pwn",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects anything that replaces the entry point", () => {
    for (const arg of [
      "-jar",
      "-jar=payload.jar",
      "-m",
      "--module=evil/Main",
      "-cp",
      "-classpath",
      "--class-path=evil.jar",
      "-p",
      "--module-path=evil",
      "--upgrade-module-path=evil",
      "--patch-module=java.base=evil.jar",
      "-Xbootclasspath/a:evil.jar",
      "payload.jar",
      "com.evil.Main",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects agents, argument files and crash hooks", () => {
    for (const arg of [
      "-javaagent:mods/payload.jar",
      "-JavaAgent:mods/payload.jar=run",
      "-agentlib:jdwp=transport=dt_socket",
      "-agentpath:/tmp/evil.so",
      "-Xrunjdwp:transport=dt_socket",
      "@mods/args.txt",
      "@C:\\Users\\x\\args",
      "-XX:VMOptionsFile=config/opts.txt",
      "-xx:vmoptionsfile=opts.txt",
      "-XX:Flags=evil.txt",
      "-XX:OnError=cmd",
      "-XX:OnError=sh",
      "-XX:OnOutOfMemoryError=calc",
      "-xx:onerror=sh",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects every vm option that names a file or a directory", () => {
    for (const arg of [
      "-XX:HeapDumpPath=C:\\Users\\x\\pwn.txt",
      "-XX:HeapDumpPath=pwn",
      "-XX:+HeapDumpOnOutOfMemoryError",
      "-XX:ArchiveClassesAtExit=app.jsa",
      "-XX:SharedArchiveFile=app.jsa",
      "-XX:StartFlightRecording=filename=pwn.jfr",
      "-XX:FlightRecorderOptions=repository=./pwn",
      "-XX:ErrorFile=./hs_err.log",
      "-XX:CompileCommandFile=cmds.txt",
      "-XX:LogFile=vm.log",
      "-XX:ReplayDataFile=replay.log",
      "-XX:+LogVMOutput",
      "-XX:+SomeFutureFile",
      "-XX:-SomeFutureFile",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects the system properties that hand over code or paths", () => {
    for (const arg of [
      "-Djava.class.path=evil.jar",
      "-Djava.library.path=evil",
      "-Dsun.boot.library.path=evil",
      "-DSUN.BOOT.LIBRARY.PATH=evil",
      "-Djava.system.class.loader=Evil",
      "-Djava.security.manager=allow",
      "-Dcom.sun.management.jmxremote",
      "-Dcom.sun.management.jmxremote.port=9010",
      "-Dcom.sun.management.jmxremote.authenticate=false",
      "-dcom.sun.management.config.file=jmx.props",
      "-Dlog4j.configurationFile=evil.xml",
      "-Dsomething=C:\\Windows\\System32\\evil.dll",
      "-Dsomething=/etc/passwd",
      "-Dsomething=../../payload.jar",
      "-Dsomething=file:///c:/evil",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects a traversal hidden in a property value", () => {
    for (const arg of [
      "-Djava.ext.dirs=mods/../../../evil",
      "-Dsomething=mods/../evil",
      "-Dsomething=a/../b",
      "-Dsomething=..",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects empty and non-string tokens", () => {
    expect(isAllowedJvmArgument("")).toBe(false);
    expect(isAllowedJvmArgument("   ")).toBe(false);
    expect(isAllowedJvmArgument(undefined)).toBe(false);
    expect(isAllowedJvmArgument(42)).toBe(false);
  });
});

describe("isAllowedGameArgument", () => {
  it("keeps the flags minecraft itself understands", () => {
    for (const arg of [
      "--quickPlayMultiplayer",
      "--fullscreen",
      "--width",
      "1280",
      "--demo",
    ]) {
      expect(isAllowedGameArgument(arg)).toBe(true);
    }
  });

  it("rejects jvm-shaped tokens that do not belong after the main class", () => {
    for (const arg of [
      "-Xmx4G",
      "-Dfoo=bar",
      "-javaagent:evil.jar",
      "@args.txt",
      "-jar",
      "--module-path=evil",
    ]) {
      expect(isAllowedGameArgument(arg)).toBe(false);
    }
  });
});

describe("whitespace inside a token", () => {
  it("rejects a padded jvm argument instead of passing the raw one", () => {
    for (const arg of [
      "-Xmx4G ",
      " -Xmx4G",
      " -Xmx4G ",
      "-XX:+UseG1GC ",
      " -XX:+UseG1GC",
      "\t-Xmx4G",
      "-Dfile.encoding=UTF-8 ",
      "--add-opens=java.base/java.lang=ALL-UNNAMED ",
    ]) {
      expect(isAllowedJvmArgument(arg)).toBe(false);
    }
  });

  it("rejects a padded game argument as well", () => {
    for (const arg of ["--fullscreen ", " --fullscreen", "--width\t"]) {
      expect(isAllowedGameArgument(arg)).toBe(false);
    }

    expect(isAllowedGameArgument("--fullscreen")).toBe(true);
  });

  it("keeps a space that belongs inside the value", () => {
    expect(isAllowedJvmArgument("-Dhttp.agent=Mozilla 5.0")).toBe(true);
    expect(isAllowedJvmArgument("-Xmx 4G")).toBe(false);
    expect(isAllowedJvmArgument("-XX:+Use G1GC")).toBe(false);
  });

  it("hands the launcher only the tokens it checked", () => {
    const { safe, rejected } = filterRunArguments(
      [
        "-Xmx4G ",
        " -Xmx4G",
        "-XX:+UseG1GC ",
        "-Xmx4G",
        "-Dhttp.agent=Mozilla 5.0",
      ],
      "jvm",
    );

    expect(safe).toEqual(["-Xmx4G", "-Dhttp.agent=Mozilla 5.0"]);
    expect(rejected).toEqual(["-Xmx4G ", " -Xmx4G", "-XX:+UseG1GC "]);

    for (const arg of safe) expect(isAllowedJvmArgument(arg)).toBe(true);
  });

  it("drops a padded module flag together with its value", () => {
    expect(
      filterRunArguments(
        ["--add-opens ", "java.base/java.lang=ALL-UNNAMED"],
        "jvm",
      ),
    ).toEqual({
      safe: [],
      rejected: ["--add-opens ", "java.base/java.lang=ALL-UNNAMED"],
    });

    expect(
      filterRunArguments(
        ["--add-opens", "java.base/java.lang=ALL-UNNAMED "],
        "jvm",
      ),
    ).toEqual({
      safe: [],
      rejected: ["--add-opens", "java.base/java.lang=ALL-UNNAMED "],
    });
  });
});

describe("filterRunArguments", () => {
  it("keeps a module flag together with its separate value token", () => {
    const args = [
      "-Xmx6G",
      "--add-opens",
      "java.base/java.lang=ALL-UNNAMED",
      "--add-modules",
      "jdk.incubator.vector",
      "-XX:+UseG1GC",
    ];

    expect(filterRunArguments(args, "jvm")).toEqual({
      safe: args,
      rejected: [],
    });
  });

  it("drops a module flag whose value is missing or unusable", () => {
    expect(
      filterRunArguments(["--add-opens", "-Xmx6G"], "jvm"),
    ).toEqual({ safe: ["-Xmx6G"], rejected: ["--add-opens"] });

    expect(filterRunArguments(["--add-opens"], "jvm")).toEqual({
      safe: [],
      rejected: ["--add-opens"],
    });
  });

  it("drops the value that follows a rejected space-separated option", () => {
    const { safe, rejected } = filterRunArguments(
      ["-Xmx6G", "-cp", "evil.jar", "-XX:+UseG1GC"],
      "jvm",
    );

    expect(safe).toEqual(["-Xmx6G", "-XX:+UseG1GC"]);
    expect(rejected).toEqual(["-cp", "evil.jar"]);
  });

  it("drops the confirmed bypasses while keeping the rest of the line", () => {
    const { safe, rejected } = filterRunArguments(
      [
        "-Xmx6G",
        "-Xlog:gc:pwn.txt",
        "-Xloggc:pwn.txt",
        "-jar",
        "payload.jar",
        "-XX:StartFlightRecording=filename=pwn.jfr",
        "-Dsun.boot.library.path=payload",
        "-XX:+UseG1GC",
      ],
      "jvm",
    );

    expect(safe).toEqual(["-Xmx6G", "-XX:+UseG1GC"]);
    expect(rejected).toEqual([
      "-Xlog:gc:pwn.txt",
      "-Xloggc:pwn.txt",
      "-jar",
      "payload.jar",
      "-XX:StartFlightRecording=filename=pwn.jfr",
      "-Dsun.boot.library.path=payload",
    ]);
  });

  it("lets the caller allow tokens the launcher itself wrote", () => {
    const args = ["@user_jvm_args.txt", "-jar", "forge.jar", "nogui"];

    expect(
      filterRunArguments(args, "jvm", (arg) => args.includes(arg)),
    ).toEqual({ safe: args, rejected: [] });
  });

  it("returns the list untouched when everything is allowed", () => {
    const args = ["-Xmx4G", "-XX:+UseG1GC", "-Dfabric.debug=true"];

    expect(filterRunArguments(args, "jvm")).toEqual({ safe: args, rejected: [] });
  });
});
