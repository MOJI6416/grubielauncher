import { IServerConf, ServerCore } from "@/types/Server";
import { Java } from "./Java";
import { IVersionConf } from "@/types/IVersion";
import { ILocalAccount } from "@/types/Account";
import path from "path";
import { getJavaAgent, HTTP_AGENT_JVM_ARGUMENT } from "../utilities/other";
import { Downloader } from "../utilities/downloader";
import fs from "fs-extra";
import { installServer } from "../utilities/game";
import { Backend } from "../services/Backend";
import { mainWindow } from "../windows/mainWindow";
import {
  VersionInstallProgress,
  VersionInstallStage,
} from "@/types/InstallationProgress";
import {
  createLoaderInstallerProgressState,
  parseLoaderInstallerProgressLine,
} from "../utilities/loaderInstallerProgress";
import {
  assertSafeFileSegment,
  toArgfilePath,
  validateServerMemory,
} from "./serverScriptSafety";
import { AIKAR_FLAGS } from "../utilities/serverManager";

export class ServerGame {
  private serverPath: string = "";
  private versionPath: string = "";
  private version: IVersionConf | undefined = undefined;
  private serverConf: IServerConf | null = null;
  private downloadLimit: number = 6;
  private account: ILocalAccount | undefined = undefined;
  private downloader: Downloader;

  constructor(
    account: ILocalAccount | undefined,
    downloadLimit: number,
    versionPath: string,
    serverPath: string,
    conf: IServerConf,
    version?: IVersionConf,
  ) {
    this.account = account;
    this.versionPath = versionPath;
    this.serverPath = serverPath;
    this.version = version;
    this.serverConf = conf;
    this.downloadLimit = downloadLimit;
    this.downloader = new Downloader(this.downloadLimit);
  }

  private async resolveJavaMajorVersion(): Promise<number> {
    const fallback = this.serverConf?.javaMajorVersion ?? 21;
    const mcId = this.version?.version?.id;
    if (!mcId || !this.versionPath) return fallback;
    try {
      const manifest = await fs.readJSON(
        path.join(this.versionPath, `${mcId}.json`),
      );
      const major = manifest?.javaVersion?.majorVersion;
      if (typeof major === "number" && major > 0) return major;
    } catch {}
    return fallback;
  }

  private sendInstallProgress(
    stage: VersionInstallStage,
    progressPercent: number,
    subProgress?: VersionInstallProgress["subProgress"],
  ) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;

    const info: VersionInstallProgress | null =
      stage === "done"
        ? null
        : {
            versionName: this.version?.name || this.serverConf?.core || "",
            loaderName: this.version?.loader.name || "vanilla",
            operation: "server",
            stage,
            progressPercent,
            isIndeterminate: true,
            subProgress,
          };

    try {
      mainWindow.webContents.send("versionInstallProgress", info);
    } catch {}
  }

  async install(options?: { keepProgressOpen?: boolean }) {
    if (!this.serverConf) return;

    await fs.ensureDir(this.serverPath);

    let ok = false;
    try {
      await this.installInternal();
      ok = true;
    } finally {
      if (!ok || !options?.keepProgressOpen) {
        this.sendInstallProgress("done", 100);
      }
    }
  }

  private getValidatedMemory(): number {
    return validateServerMemory(this.serverConf?.memory);
  }

  private async installInternal() {
    if (!this.serverConf) return;

    const memory = this.getValidatedMemory();
    const memoryArgs = this.serverConf.aikarFlags
      ? `-Xms${memory}M -Xmx${memory}M ${AIKAR_FLAGS}`
      : `-Xmx${memory}M`;
    assertSafeFileSegment(this.serverConf.core, "server core");

    this.sendInstallProgress("preparing", 5);

    const javaMajorVersion = await this.resolveJavaMajorVersion();
    this.serverConf.javaMajorVersion = javaMajorVersion;
    const java = new Java(javaMajorVersion);
    await java.init();
    this.sendInstallProgress("java", 15);
    await java.install();

    if (
      !java.javaServerPath ||
      !(await fs.pathExists(java.javaServerPath))
    )
      throw new Error(
        `Java ${javaMajorVersion} runtime for the server could not be installed`,
      );

    if (!this.version || !this.account) {
      throw new Error("Server install requires version and account data");
    }

    let jar = `${this.serverConf.core}.jar`;
    const jarPath = path.join(this.serverPath, jar);

    this.sendInstallProgress("files", 35);
    const jarStats = await fs.stat(jarPath).catch(() => null);
    if (!jarStats || jarStats.size === 0) {
      const coreUrl = this.serverConf.downloads?.server;
      if (!coreUrl) {
        throw new Error(
          "Server core jar is missing and no download URL is available",
        );
      }

      await this.downloader.downloadFiles([
        {
          url: coreUrl,
          destination: jarPath,
          group: "server",
        },
      ]);

      const downloadedStats = await fs.stat(jarPath).catch(() => null);
      if (!downloadedStats || downloadedStats.size === 0) {
        throw new Error(`Failed to download server core: ${coreUrl}`);
      }
    }

    let cwd = this.serverPath;
    const javaCmd = java.javaServerPath.includes(" ")
      ? `"${java.javaServerPath}"`
      : java.javaServerPath;

    const backend = new Backend();
    let authlib: any = null;
    try {
      authlib = await backend.getAuthlib();
    } catch {
      authlib = null;
    }

    let javaagent = "";

    const params = ["-jar", jarPath];

    if (this.serverConf.core == ServerCore.QUILT) {
      params.push(
        ...["install", "server", this.version.version.id, "--download-server"],
      );
    } else if (
      this.serverConf.core == ServerCore.FORGE ||
      this.serverConf.core == ServerCore.NEOFORGE
    ) {
      params.push("--installServer");
    }

    this.sendInstallProgress("installer", 55);

    const installerProgressState = createLoaderInstallerProgressState(55);
    const handleInstallerOutput = (message: string) => {
      for (const line of message.split(/\r?\n/)) {
        const update = parseLoaderInstallerProgressLine(
          line,
          installerProgressState,
          { startPercent: 55, endPercent: 78 },
        );
        if (!update) continue;

        this.sendInstallProgress("installer", update.progressPercent, {
          kind: "loaderInstaller",
          titleKey: "installationProgress.subProgress.loaderInstaller.title",
          progressPercent: Math.max(
            0,
            Math.min(
              100,
              Math.round(((update.progressPercent - 55) / (78 - 55)) * 100),
            ),
          ),
          isIndeterminate: false,
          detailsKey: update.detailsKey,
          detailsParams: update.detailsParams,
        });
      }
    };

    await installServer(
      java.javaServerPath,
      params,
      cwd,
      handleInstallerOutput,
    );
    this.sendInstallProgress("loader", 80);

    if (
      this.account.type != "microsoft" &&
      this.account.type != "plain" &&
      authlib
    ) {
      javaagent = `${HTTP_AGENT_JVM_ARGUMENT} ${getJavaAgent(
        this.account.type,
        toArgfilePath(path.join("libraries", authlib.path)),
        true,
      )} `;

      await this.downloader.downloadFiles([
        {
          url: authlib.url,
          destination: path.join(this.serverPath, "libraries", authlib.path),
          group: "server",
          sha1: authlib.sha1,
          size: authlib.size,
        },
      ]);
    }

    const batPath = path.join(this.serverPath, "run.bat");
    const shPath = path.join(this.serverPath, "run.sh");

    let isCreateRunFiles = true;

    if (this.serverConf.core == ServerCore.QUILT) {
      const quiltLaunchJar = path.join(
        this.serverPath,
        "quilt-server-launch.jar",
      );

      if (!(await fs.pathExists(quiltLaunchJar))) {
        throw new Error(
          "Quilt installer did not create quilt-server-launch.jar — the installer likely failed",
        );
      }

      await fs.remove(jarPath).catch(() => {});
      await fs.rename(quiltLaunchJar, jarPath);
    } else if (
      this.serverConf.core == ServerCore.FORGE ||
      this.serverConf.core == ServerCore.NEOFORGE
    ) {
      const version = assertSafeFileSegment(
        this.version?.version.id ?? "",
        "version id",
      );
      const serverJar = path.join(
        this.serverPath,
        `minecraft_server.${version}.jar`,
      );

      const isExists = await fs.pathExists(serverJar);
      if (!isExists) {
        isCreateRunFiles = false;

        const batExists = await fs.pathExists(batPath);
        const shExists = await fs.pathExists(shPath);

        if (!batExists || !shExists) {
          throw new Error(
            `${this.serverConf.core} installer did not create run scripts — check access to maven.minecraftforge.net and libraries.minecraft.net`,
          );
        } else {
          const batData = await fs.readFile(batPath, "utf-8");
          await fs.writeFile(
            batPath,
            batData.replace(/^java\b/m, javaCmd).replaceAll("%*", "nogui %*"),
            "utf-8",
          );

          const shData = await fs.readFile(shPath, "utf-8");
          await fs.writeFile(
            shPath,
            shData
              .replace(/^java\b/m, javaCmd)
              .replaceAll('"$@"', 'nogui "$@"'),
            "utf-8",
          );

          const jvmArgs = path.join(this.serverPath, "user_jvm_args.txt");
          await fs.writeFile(
            jvmArgs,
            `${javaagent}${memoryArgs}`,
            "utf-8",
          );
        }
      } else {
        const core = this.serverConf.core;
        const files = await fs.readdir(this.serverPath);
        const universalJar =
          files.find((file) => /^forge-.+-universal\.jar$/i.test(file)) ??
          files.find(
            (file) => file.startsWith(`${core}-`) && file.endsWith(".jar"),
          );

        if (!universalJar) {
          throw new Error(
            `${core} installer did not create a universal server jar — the installer likely failed`,
          );
        }

        await fs.remove(jarPath).catch(() => {});
        jar = universalJar;
      }
    }

    if (isCreateRunFiles) {
      assertSafeFileSegment(jar, "server jar");
      const batData = `@echo off
${javaCmd} ${javaagent} ${memoryArgs} -jar ${jar} nogui
pause`;

      const shData = `#!/bin/sh
${javaCmd} ${javaagent} ${memoryArgs} -jar ${jar} nogui
read -p "Press [Enter] key to continue..."`;

      await fs.writeFile(batPath, batData, "utf-8");
      await fs.writeFile(shPath, shData, "utf-8");
      await fs.chmod(shPath, 0o755).catch(() => {});
    }

    return;
  }
}
