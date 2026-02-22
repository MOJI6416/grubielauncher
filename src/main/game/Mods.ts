import { Version } from "./Version";
import { IServerConf, ServerCore } from "@/types/Server";
import { ProjectType } from "@/types/Modrinth";
import { DownloadItem } from "@/types/Downloader";
import path from "path";
import fs from "fs-extra";
import { Downloader } from "../utilities/downloader";
import { rimraf } from "rimraf";
import { IVersionConf } from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import { projetTypeToFolder } from "../utilities/modManager";
import { getWorldName } from "../utilities/worlds";

export class Mods {
  private conf: IVersionConf;
  private version: Version;
  private server: IServerConf | undefined;
  private files: {
    filename: string;
    type: ProjectType;
  }[] = [];
  private downloadLimit = 6;
  private downloader: Downloader;
  private initPromise: Promise<void>;

  constructor(
    settings: TSettings,
    version: IVersionConf,
    server?: IServerConf,
  ) {
    this.conf = version;
    this.server = server;
    this.downloadLimit = settings.downloadLimit;
    this.downloader = new Downloader(this.downloadLimit);

    this.version = new Version(this.conf);
    this.initPromise = Promise.resolve(this.version.init()).catch(() => {});
  }

  async check() {
    await this.initPromise;

    this.files = [];

    const storagePath = path.join(this.version.versionPath, "storage");

    const downloadFiles: DownloadItem[] = [];
    const worlds: string[] = [];
    const worldZips: string[] = [];

    for (const mod of this.version.version.loader.mods) {
      if (!mod.version) continue;

      const folderName = projetTypeToFolder(mod.projectType);
      let folderPath = path.join(this.version.versionPath, folderName);

      if (mod.projectType == ProjectType.PLUGIN) {
        if (!this.server) continue;

        const serverPath = path.join(this.version.versionPath, "server");
        folderPath = path.join(serverPath, folderName);
      }

      for (const file of mod.version.files) {
        let filepath = path.join(folderPath, file.filename);

        if (mod.projectType == ProjectType.WORLD) {
          filepath = path.join(storagePath, "worlds", file.filename);

          worldZips.push(filepath);

          const existsStorage = (await fs.pathExists(filepath))
            ? filepath
            : null;
          const existsUrl = file.localPath
            ? (await fs.pathExists(file.localPath))
              ? file.localPath
              : null
            : null;

          const zipPath = existsStorage || existsUrl;
          if (zipPath) {
            const worldName = await getWorldName(zipPath);
            if (worldName) {
              worlds.push(worldName);

              this.files.push({
                filename: worldName,
                type: ProjectType.WORLD,
              });
            }
          }
        }

        this.files.push({
          filename: file.filename,
          type: mod.projectType,
        });

        downloadFiles.push({
          destination: filepath,
          url: file.localPath ? `file://${file.localPath}` : file.url,
          group: "mods",
          sha1: file.sha1,
          size: file.size,
          options:
            mod.projectType == ProjectType.WORLD
              ? {
                  extract: true,
                  extractFolder: folderPath,
                  extractDelete: false,
                }
              : undefined,
        });

        if (
          this.server &&
          [
            ServerCore.FABRIC,
            ServerCore.QUILT,
            ServerCore.FORGE,
            ServerCore.NEOFORGE,
          ].includes(this.server.core) &&
          mod.projectType == ProjectType.MOD &&
          file.isServer
        ) {
          const fileServerPath = path.join(
            this.version.versionPath,
            "server",
            folderName,
            file.filename,
          );

          downloadFiles.push({
            destination: fileServerPath,
            url: (await fs.pathExists(filepath))
              ? `file://${filepath}`
              : file.url,
            group: "mods",
            sha1: file.sha1,
            size: file.size,
          });
        }
      }
    }

    await this.downloader.downloadFiles(downloadFiles);

    for (const zipPath of [...new Set(worldZips)]) {
      if (!(await fs.pathExists(zipPath))) continue;

      const worldName = await getWorldName(zipPath);
      if (!worldName) continue;

      if (!worlds.includes(worldName)) worlds.push(worldName);

      if (
        !this.files.some(
          (f) => f.type === ProjectType.WORLD && f.filename === worldName,
        )
      ) {
        this.files.push({ filename: worldName, type: ProjectType.WORLD });
      }
    }

    for (const world of worlds) {
      const worldPath = path.join(this.version.versionPath, "saves", world);
      if (await fs.pathExists(worldPath)) {
        const dlFilePath = path.join(worldPath, ".downloaded");
        if (!(await fs.pathExists(dlFilePath)))
          await fs.writeFile(dlFilePath, "");
      }
    }

    const tasks: Promise<void>[] = [
      this.comparison(ProjectType.MOD),
      this.comparison(ProjectType.RESOURCEPACK),
      this.comparison(ProjectType.SHADER),
      this.comparison(ProjectType.WORLD),
      this.comparison(ProjectType.DATAPACK),
    ];

    if (
      this.server &&
      [ServerCore.BUKKIT, ServerCore.SPIGOT, ServerCore.PAPER].includes(
        this.server.core,
      )
    ) {
      tasks.push(this.comparison(ProjectType.PLUGIN));
    }

    await Promise.all(tasks);
  }

  private async comparison(projectType: ProjectType) {
    const storagePath = path.join(this.version.versionPath, "storage");
    const folderName = projetTypeToFolder(projectType);

    let folderPath = path.join(this.version.versionPath, folderName);
    if (this.server && projectType == ProjectType.PLUGIN) {
      const serverPath = path.join(this.version.versionPath, "server");
      folderPath = path.join(serverPath, folderName);
    }

    const isExists = await fs.pathExists(folderPath);
    if (!isExists) return;

    const filenames = this.files
      .filter((f) => f.type == projectType)
      .map((f) => f.filename);
    const files = await fs.readdir(folderPath);
    const deleteFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(folderPath, file);

      let isDirectory = false;
      try {
        isDirectory = fs.lstatSync(filePath).isDirectory();
      } catch {
        continue;
      }

      if (
        projectType == ProjectType.WORLD &&
        isDirectory &&
        !(await fs.pathExists(path.join(filePath, ".downloaded")))
      )
        continue;

      if (
        (isDirectory && projectType != ProjectType.WORLD) ||
        filenames.includes(file.replace(".disabled", ""))
      )
        continue;

      deleteFiles.push(filePath);
      if (
        this.server &&
        [
          ServerCore.FABRIC,
          ServerCore.QUILT,
          ServerCore.FORGE,
          ServerCore.NEOFORGE,
        ].includes(this.server.core)
      ) {
        const serverFilePath = path.join(
          this.version.versionPath,
          "server",
          folderName,
          file,
        );
        const isServerFileExists = await fs.pathExists(serverFilePath);
        if (isServerFileExists) deleteFiles.push(serverFilePath);
      }
    }

    if (projectType == ProjectType.WORLD) {
      const worldsPath = path.join(storagePath, "worlds");
      if (await fs.pathExists(worldsPath)) {
        const files = await fs.readdir(worldsPath);

        for (const file of files)
          if (!filenames.includes(file))
            deleteFiles.push(path.join(worldsPath, file));
      }
    }

    await rimraf(deleteFiles);
  }

  async downloadOther() {
    await this.initPromise;

    if (!this.version.version.loader.other) return;

    const tempPath = path.join(this.version.versionPath, "temp");

    try {
      await this.downloader.downloadFiles([
        {
          destination: path.join(tempPath, "other.zip"),
          group: "other",
          url: this.version.version.loader.other.url,
          options: {
            extract: true,
            extractFolder: this.version.versionPath,
          },
        },
      ]);
    } finally {
      await rimraf(tempPath).catch(() => {});
    }
  }
}
