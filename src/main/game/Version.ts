import { IVersionConf } from "@/types/IVersion";
import { IVersionManifest } from "@/types/IVersionManifest";
import { IAssetIndex } from "@/types/IAssetIndex";
import { LANGUAGES, TSettings } from "@/types/Settings";
import { IAuth, ILocalAccount } from "@/types/Account";
import { Java } from "./Java";
import { IFabricManifest } from "@/types/IFabricManifest";
import { IInstallProfile } from "@/types/IInstallProfile";
import { DownloadItem } from "@/types/Downloader";
import path from "path";
import fs from "fs-extra";
import { Downloader } from "../utilities/downloader";
import {
  convertMavenCoordinateToJarPath,
  getFullLangCode,
  getJavaAgent,
  getOS,
  HTTP_AGENT_JVM_ARGUMENT,
  matchesOsRules,
  removeDuplicatesLibraries,
} from "../utilities/other";
import { app } from "electron";
import { runGame, runJar } from "../utilities/game";
import { getAuthlibCached } from "../utilities/authlib";
import { AuthlibEnsureResult } from "@/types/IAuthlib";
import { readJSONFromArchive } from "../utilities/archiver";
import {
  VersionInstallOperation,
  VersionInstallOptions,
  VersionInstallProgress,
  VersionInstallStage,
  VERSION_INSTALL_CANCELLED,
} from "@/types/InstallationProgress";
import { mainWindow } from "../windows/mainWindow";
import {
  getUnusedInstallResourcePaths,
  normalizeInstallResourcePath,
  shouldCleanupCancelledInstall,
} from "../utilities/installCleanup";
import {
  createLoaderInstallerProgressState,
  parseLoaderInstallerProgressLine,
} from "../utilities/loaderInstallerProgress";
import { assertSafeVersionName } from "@/shared/versionName";
import { buildMemoryArguments } from "@/shared/jvmDefaults";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import { assertTrustedDownloadUrl } from "../utilities/trustedHosts";
import { resolveOfflineUuid } from "../utilities/offlineUuidMigration";

type VersionInstallRuntimeOptions = VersionInstallOptions & {
  signal?: AbortSignal;
};

function parseCustomRunArguments(input?: string) {
  if (!input?.trim()) return [];

  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\\" && (next === '"' || next === "'")) {
      current += next;
      index++;
      continue;
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote === char ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) args.push(current);

  return args;
}

export class Version {
  public version: IVersionConf;
  public manifest: IVersionManifest | undefined;

  public launcherPath: string = "";
  public minecraftPath: string = "";
  public versionPath: string = "";
  public javaPath: string = "";
  public isQuickPlayMultiplayer: boolean = false;
  public isQuickPlaySingleplayer: boolean = false;
  private manifestPath: string = "";

  private downloader: Downloader = new Downloader(6);
  private initPromise: Promise<void> | null = null;
  private installOperation: VersionInstallOperation = "install";
  private installAbortSignal: AbortSignal | null = null;

  constructor(version: IVersionConf) {
    this.version = version;
  }

  private async ensureInitialized() {
    if (this.launcherPath && this.minecraftPath && this.versionPath) return;

    if (!this.initPromise) {
      this.initPromise = this.init().finally(() => {
        this.initPromise = null;
      });
    }

    await this.initPromise;
  }

  public async init() {
    assertSafeVersionName(this.version.name);

    this.launcherPath = path.join(app.getPath("appData"), ".grubielauncher");
    this.minecraftPath = path.join(this.launcherPath, "minecraft");
    this.versionPath = path.join(
      this.minecraftPath,
      "versions",
      this.version.name,
    );
    this.manifestPath = path.join(
      this.versionPath,
      `${this.version.version.id}.json`,
    );

    await fs.ensureDir(this.versionPath);
    const isExistsManifest = await fs.pathExists(this.manifestPath);

    if (isExistsManifest) {
      await this.readManifest();
      if (this.manifest) {
        const java = new Java(
      this.manifest.javaVersion?.majorVersion ??
        mcVersionToJavaMajor(this.version.version.id),
    );
        await java.init();
        this.javaPath = java.javaPath;
      }
    }
  }

  private sendInstallInfo(info: VersionInstallProgress | null) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.webContents.isDestroyed()) return;

    try {
      mainWindow.webContents.send("versionInstallProgress", info);
    } catch {}
  }

  private sendInstallProgress(
    stage: VersionInstallStage,
    progressPercent: number,
    isIndeterminate = false,
    details?: string,
    detailsKey?: string,
    detailsParams?: VersionInstallProgress["detailsParams"],
    subProgress?: VersionInstallProgress["subProgress"],
  ) {
    this.sendInstallInfo({
      versionName: this.version.name,
      loaderName: this.version.loader.name,
      operation: this.installOperation,
      stage,
      progressPercent,
      isIndeterminate,
      details,
      detailsKey,
      detailsParams,
      subProgress,
    });
  }

  public cancelInstall() {
    this.downloader.cancelDownload();
  }

  private throwIfInstallCancelled() {
    if (this.installAbortSignal?.aborted) {
      throw new Error(VERSION_INSTALL_CANCELLED);
    }
  }

  private isInstallCancelError(error: unknown) {
    if (this.installAbortSignal?.aborted) return true;
    if (error instanceof Error) {
      return (
        error.message === VERSION_INSTALL_CANCELLED ||
        error.message === "AbortError" ||
        error.name === "AbortError"
      );
    }

    return false;
  }

  private async cleanupCancelledInstall(
    account: ILocalAccount,
    cleanupOnCancel?: boolean,
  ) {
    if (!shouldCleanupCancelledInstall(cleanupOnCancel)) return;

    await this.delete(account, true).catch((error) => {
      console.error(
        `[version:install] failed to cleanup cancelled install ${this.versionPath}:`,
        error,
      );
    });
  }

  public async install(
    settings: TSettings,
    account: ILocalAccount,
    items: DownloadItem[] = [],
    options: VersionInstallRuntimeOptions = {},
  ) {
    await this.ensureInitialized();
    this.downloader = new Downloader(settings.downloadLimit || 6);
    this.installOperation = options.operation ?? "install";
    this.installAbortSignal = options.signal ?? null;
    this.sendInstallProgress("preparing", 2, true);

    try {
      this.throwIfInstallCancelled();
      await this.installInternal(settings, account, items);
      this.throwIfInstallCancelled();
      this.sendInstallProgress("done", 100);
    } catch (error) {
      if (this.isInstallCancelError(error)) {
        await this.cleanupCancelledInstall(account, options.cleanupOnCancel);
        throw new Error(VERSION_INSTALL_CANCELLED);
      }

      throw error;
    } finally {
      const wasCancelled = Boolean(this.installAbortSignal?.aborted);
      if (!options.keepProgressOpen || wasCancelled) {
        this.sendInstallInfo(null);
      }
      this.installOperation = "install";
      this.installAbortSignal = null;
    }
  }

  private async installInternal(
    settings: TSettings,
    account: ILocalAccount,
    items: DownloadItem[] = [],
  ) {
    const downloadItems: DownloadItem[] = [...items];
    const downloadSignal = this.installAbortSignal ?? undefined;
    this.throwIfInstallCancelled();

    const manifestPath = path.join(
      this.versionPath,
      `${this.version.version.id}.json`,
    );
    let isNewManifest = false;

    const isExistsManifest = await fs.pathExists(manifestPath);
    if (!isExistsManifest) {
      isNewManifest = true;

      assertTrustedDownloadUrl(
        this.version.version.url,
        "version manifest url",
      );

      this.sendInstallProgress("manifest", 8, true);
      await this.downloader.downloadFiles(
        [
          {
            url: this.version.version.url,
            destination: manifestPath,
            group: "manifest",
          },
        ],
        downloadSignal,
      );
    }

    this.throwIfInstallCancelled();
    this.sendInstallProgress("manifest", 12, false);
    await this.readManifest();
    this.throwIfInstallCancelled();

    if (!this.manifest) {
      throw new Error(`Failed to read version manifest: ${manifestPath}`);
    }

    this.sendInstallProgress("java", 18, true);
    const java = new Java(
      this.manifest.javaVersion?.majorVersion ??
        mcVersionToJavaMajor(this.version.version.id),
    );
    const needsJavaBeforeLoader = ["forge", "neoforge"].includes(
      this.version.loader.name,
    );
    let javaFinalizeNeeded = false;

    if (needsJavaBeforeLoader) {
      await java.init(downloadSignal);
      this.throwIfInstallCancelled();
      await java.install(downloadSignal);
      this.throwIfInstallCancelled();
      this.javaPath = java.javaPath;
    } else {
      const javaItem = await java.prepareInstallItem(downloadSignal);
      this.throwIfInstallCancelled();

      if (javaItem) {
        downloadItems.push(javaItem);
        javaFinalizeNeeded = true;
      } else {
        this.javaPath = java.javaPath;
      }
    }

    const agent = "-Dhttp.agent=Mozilla/5.0";
    if (
      java.majorVersion === 8 &&
      this.manifest.arguments?.jvm &&
      !this.manifest.arguments.jvm.includes(agent)
    ) {
      this.manifest.arguments.jvm.push(agent);
    }

    let isDownloadClient = true;
    this.sendInstallProgress("loader", 28, true);

    if (
      ["fabric", "quilt"].includes(this.version.loader.name) &&
      this.version.loader.version
    ) {
      const fabricManifestPath = path.join(
        this.versionPath,
        `${this.version.loader.name}.json`,
      );
      let fabricManifest: IFabricManifest | undefined = undefined;

      const isExistsFabricManifest = await fs.pathExists(fabricManifestPath);
      if (isExistsFabricManifest) {
        fabricManifest = await fs.readJSON(fabricManifestPath, {
          encoding: "utf-8",
        });
      } else {
        this.throwIfInstallCancelled();
        assertTrustedDownloadUrl(
          this.version.loader.version.url,
          "loader manifest url",
        );
        await this.downloader.downloadFiles(
          [
            {
              url: this.version.loader.version.url,
              destination: fabricManifestPath,
              group: "manifest",
            },
          ],
          downloadSignal,
        );
        fabricManifest = await fs.readJSON(fabricManifestPath, {
          encoding: "utf-8",
        });
      }
      this.throwIfInstallCancelled();

      if (isNewManifest && fabricManifest) {
        this.manifest.mainClass = fabricManifest.mainClass;
        if (fabricManifest.arguments.jvm && this.manifest.arguments?.jvm)
          this.manifest.arguments.jvm.push(...fabricManifest.arguments.jvm);

        if (fabricManifest.arguments.game && this.manifest.arguments?.game)
          this.manifest.arguments.game.push(...fabricManifest.arguments.game);

        const fabricLibraries: IVersionManifest["libraries"] = [];
        for (const lib of fabricManifest.libraries) {
          const baseUrl = lib.url;

          const path = convertMavenCoordinateToJarPath(lib.name);

          const library: IVersionManifest["libraries"][0] = {
            name: lib.name,
            downloads: {
              artifact: {
                url: `${baseUrl}/${path}`,
                path,
                size: lib.size,
                sha1: lib.sha1,
              },
            },
          };

          fabricLibraries.push(library);
        }

        this.manifest.libraries = this.removeDuplicateLibraries(
          [...fabricLibraries, ...this.manifest.libraries],
          ["org.ow2.asm:asm"],
        );
        await this.writeManifest();
      }
    } else if (
      ["forge", "neoforge"].includes(this.version.loader.name) &&
      this.version.loader.version
    ) {
      const installerPath = path.join(
        this.versionPath,
        `${this.version.loader.name}.jar`,
      );

      const isExistsInstaller = await fs.pathExists(installerPath);
      if (!isExistsInstaller) {
        assertTrustedDownloadUrl(
          this.version.loader.version.url,
          "loader installer url",
        );
        await this.downloader.downloadFiles(
          [
            {
              url: this.version.loader.version.url,
              destination: installerPath,
              group: this.version.loader.name,
            },
          ],
          downloadSignal,
        );
      }
      this.throwIfInstallCancelled();

      if (isNewManifest) {
        const tempPath = path.join(this.versionPath, "temp");
        await fs.remove(tempPath).catch(() => {});
        await fs.ensureDir(tempPath);

        try {
          await this.writeLauncherProfile();

          let forgeInstalled = false;
          const installerProgressState = createLoaderInstallerProgressState(38);
          const createLoaderInstallerSubProgress = (
            progressPercent: number,
            detailsKey: string,
            detailsParams?: VersionInstallProgress["detailsParams"],
            isIndeterminate = false,
          ): VersionInstallProgress["subProgress"] => ({
            kind: "loaderInstaller",
            titleKey: "installationProgress.subProgress.loaderInstaller.title",
            progressPercent: Math.max(
              0,
              Math.min(
                100,
                Math.round(((progressPercent - 38) / (58 - 38)) * 100),
              ),
            ),
            isIndeterminate,
            detailsKey,
            detailsParams,
          });
          const handleInstallerOutput = (message: string) => {
            for (const line of message.split(/\r?\n/)) {
              const update = parseLoaderInstallerProgressLine(
                line,
                installerProgressState,
                { startPercent: 38, endPercent: 58 },
              );
              if (!update) continue;

              this.sendInstallProgress(
                "installer",
                update.progressPercent,
                true,
                undefined,
                undefined,
                undefined,
                createLoaderInstallerSubProgress(
                  update.progressPercent,
                  update.detailsKey,
                  update.detailsParams,
                ),
              );
            }
          };

          this.sendInstallProgress(
            "installer",
            38,
            true,
            undefined,
            undefined,
            undefined,
            createLoaderInstallerSubProgress(
              38,
              "installationProgress.installerDetails.starting",
            ),
          );

          try {
            const installResult = await runJar(
              this.javaPath,
              ["-jar", installerPath, "--installClient", "."],
              tempPath,
              {
                signal: downloadSignal,
                onOutput: ({ message }) => handleInstallerOutput(message),
              },
            );
            forgeInstalled = installResult === "done" || installResult === 0;
          } catch (error) {
            this.sendInstallProgress(
              "installer",
              Math.max(42, installerProgressState.progressPercent),
              true,
              undefined,
              undefined,
              undefined,
              createLoaderInstallerSubProgress(
                Math.max(42, installerProgressState.progressPercent),
                "installationProgress.installerDetails.legacyFallback",
                undefined,
                true,
              ),
            );
            console.warn(
              `${this.version.loader.name} installer failed, falling back to install_profile.json:`,
              error,
            );
          }

          const versionsPath = path.join(tempPath, "versions");
          this.throwIfInstallCancelled();
          const forgeManifestName =
            this.version.loader.name == "forge"
              ? `${this.version.version.id}-forge-${this.version.loader.version.id}`
              : `neoforge-${this.version.loader.version.id}`;
          const installedForgeManifestPath = forgeInstalled
            ? await this.findInstalledLoaderManifestPath(
                versionsPath,
                forgeManifestName,
              )
            : null;

          this.sendInstallProgress("loader", 58, true);
          this.throwIfInstallCancelled();

          if (!forgeInstalled || !installedForgeManifestPath) {
            const installProfile = await readJSONFromArchive<IInstallProfile>(
              installerPath,
              "install_profile.json",
            );
            if (!installProfile?.versionInfo?.libraries) {
              throw new Error(
                "Failed to read install_profile.json from Forge installer.",
              );
            }

            this.manifest.mainClass = installProfile.versionInfo.mainClass;
            this.manifest.minecraftArguments =
              installProfile.versionInfo.minecraftArguments;

            for (const lib of installProfile.versionInfo.libraries) {
              if (!lib.url) lib.url = "https://libraries.minecraft.net/";

              let path = convertMavenCoordinateToJarPath(lib.name);

              if (path.includes("minecraftforge/forge")) {
                path = path.replace(".jar", `-universal.jar`);
              }

              const library: IVersionManifest["libraries"][0] = {
                name: lib.name,
                downloads: {
                  artifact: {
                    url: `${lib.url}/${path}`,
                    path,
                    size: 0,
                    sha1: lib.checksums ? lib.checksums[0] : "",
                  },
                },
              };

              this.manifest.libraries.push(library);
            }
          } else {
            const installedClientPath = path.join(
              versionsPath,
              this.version.version.id,
              `${this.version.version.id}.jar`,
            );

            if (await fs.pathExists(installedClientPath)) {
              await fs.copyFile(
                installedClientPath,
                path.join(this.versionPath, `${this.version.version.id}.jar`),
              );
              isDownloadClient = false;
            }

            const forgeManifestPath = path.join(
              this.versionPath,
              `${this.version.loader.name}.json`,
            );

            await fs.copyFile(installedForgeManifestPath, forgeManifestPath);

            const tempLibrariesPath = path.join(tempPath, "libraries");
            if (await fs.pathExists(tempLibrariesPath)) {
              await fs.copy(
                tempLibrariesPath,
                path.join(this.minecraftPath, "libraries"),
                {
                  overwrite: true,
                },
              );
            }

            const forgeManifest: IVersionManifest = await fs.readJSON(
              forgeManifestPath,
              "utf-8",
            );

            this.manifest.mainClass = forgeManifest.mainClass;

            if (forgeManifest.arguments?.jvm && this.manifest.arguments?.jvm)
              this.manifest.arguments.jvm.push(...forgeManifest.arguments.jvm);

            if (forgeManifest.arguments?.game && this.manifest.arguments?.game)
              this.manifest.arguments.game.push(
                ...forgeManifest.arguments.game,
              );

            if (forgeManifest.minecraftArguments) {
              this.manifest.minecraftArguments =
                forgeManifest.minecraftArguments;
            }

            this.manifest.libraries = this.removeDuplicateLibraries(
              [...forgeManifest.libraries, ...this.manifest.libraries],
              this.version.loader.name == "forge"
                ? ["com.google.guava:guava", "com.google.guava:failureaccess"]
                : [
                    "org.ow2.asm:asm",
                    "org.apache.logging.log4j:log4j-slf4j2-impl",
                  ],
            );
          }

          await this.writeManifest();
        } finally {
          await fs.remove(tempPath).catch(() => {});
        }
      }
    }

    if (isDownloadClient) {
      const clientPath = path.join(
        this.versionPath,
        `${this.version.version.id}.jar`,
      );

      downloadItems.push({
        url: this.manifest.downloads.client.url,
        destination: clientPath,
        sha1: this.manifest.downloads.client.sha1,
        size: this.manifest.downloads.client.size,
        group: "client",
      });
    }

    if (account.type != "microsoft" && account.type != "plain") {
      this.throwIfInstallCancelled();
      const authlib = await getAuthlibCached();
      const existsAuthlib = this.manifest.libraries.find(
        (lib) => lib.name === authlib?.name,
      );

      if (authlib && !existsAuthlib) {
        this.manifest.libraries.push({
          name: authlib.name,
          downloads: {
            artifact: {
              url: authlib.url,
              path: authlib.path,
              size: authlib.size,
              sha1: authlib.sha1,
            },
          },
        });

        await this.writeManifest();
      }
    }

    if (isNewManifest) {
      this.manifest.libraries = removeDuplicatesLibraries(
        this.manifest.libraries,
      );
      await this.writeManifest();
    }

    const libraries = this.getLibraries(account);

    downloadItems.push(...libraries.downloadItems);

    const assetsIndex = this.manifest.assetIndex;
    const assetsIndexPath = path.join(
      this.minecraftPath,
      "assets",
      "indexes",
      `${assetsIndex.id}.json`,
    );

    this.sendInstallProgress("assets", 62, true);
    await this.downloader.downloadFiles(
      [
        {
          url: assetsIndex.url,
          destination: assetsIndexPath,
          sha1: assetsIndex.sha1,
          group: "assets",
          size: assetsIndex.size,
        },
      ],
      downloadSignal,
    );
    this.throwIfInstallCancelled();

    const assets = await this.getAssets();
    downloadItems.push(...assets.downloadItems);

    this.sendInstallProgress("files", 78, true);
    await this.downloader.downloadFiles(downloadItems, downloadSignal);
    this.throwIfInstallCancelled();

    if (javaFinalizeNeeded) {
      await java.finalizeInstall();
      this.javaPath = java.javaPath;
    }

    const optionsPath = path.join(this.versionPath, "options.txt");
    const isExistsOptions = await fs.pathExists(optionsPath);
    if (!isExistsOptions) {
      this.sendInstallProgress("options", 94, false);
      const lang = LANGUAGES.find((l) => l.code == settings.lang);
      if (lang) {
        await fs.writeFile(
          optionsPath,
          `lang:${getFullLangCode(lang)}`,
          "utf-8",
        );
      }
    }
  }

  public async save() {
    await this.ensureInitialized();

    this.versionPath = path.join(
      this.minecraftPath,
      "versions",
      this.version.name,
    );
    await fs.writeJSON(
      path.join(this.versionPath, "version.json"),
      this.version,
      {
        encoding: "utf-8",
        spaces: 2,
      },
    );
  }

  private getLibraries(account: ILocalAccount) {
    if (!this.manifest) return { downloadItems: [], paths: [] };

    const platform = getOS();
    if (!platform) return { downloadItems: [], paths: [] };

    const librariesPath = path.join(this.minecraftPath, "libraries");

    const downloadItems: DownloadItem[] = [];
    const paths: string[] = [];

    const libraries = this.manifest.libraries;

    for (const library of libraries) {
      if (
        library.name.includes("authlib-injector") &&
        (account.type == "microsoft" || account.type == "plain")
      )
        continue;

      if (!matchesOsRules(library.rules, platform)) continue;

      const natives = library.natives;
      const downloads = (library as any).downloads;

      const artifact = downloads?.artifact;

      if (!natives) {
        if (!artifact?.path) continue;

        const libraryPath = path.join(librariesPath, artifact.path);

        if (!artifact.url && !fs.existsSync(libraryPath)) continue;

        paths.push(libraryPath);

        if (artifact.url) {
          downloadItems.push({
            url: artifact.url,
            destination: libraryPath,
            sha1: artifact.sha1,
            size: artifact.size,
            group: "libraries",
          });
        }
      } else {
        const native = natives[platform.os]?.replace("${arch}", "64");
        if (!native) continue;

        const classifiers = downloads?.classifiers;
        if (!classifiers) continue;

        const classifier = classifiers[native];
        if (!classifier?.path || !classifier?.url) continue;

        const fileName = classifier.path.split("/").pop();
        if (!fileName) continue;

        const classifierPath = path.join(this.versionPath, "natives", fileName);

        downloadItems.push({
          url: classifier.url,
          destination: classifierPath,
          sha1: classifier.sha1,
          size: classifier.size,
          group: "natives",
          options: { extract: true },
        });
      }
    }

    return { downloadItems, paths };
  }

  private normalizeResourcePath(targetPath: string) {
    return normalizeInstallResourcePath(targetPath);
  }

  private getAssetIndexPath(manifest: IVersionManifest) {
    if (!manifest.assetIndex?.id) return null;

    return path.join(
      this.minecraftPath,
      "assets",
      "indexes",
      `${manifest.assetIndex.id}.json`,
    );
  }

  private getLibraryPathsFromManifest(
    manifest: IVersionManifest,
    account: ILocalAccount,
  ) {
    const platform = getOS();
    if (!platform) return [];

    const librariesPath = path.join(this.minecraftPath, "libraries");
    const paths: string[] = [];

    for (const library of manifest.libraries ?? []) {
      if (
        library.name.includes("authlib-injector") &&
        (account.type == "microsoft" || account.type == "plain")
      )
        continue;

      if (!matchesOsRules(library.rules, platform) || library.natives) continue;

      const artifact = (library as any).downloads?.artifact;
      if (!artifact?.path) continue;

      paths.push(path.join(librariesPath, artifact.path));
    }

    return paths;
  }

  private async getAssetPathsFromManifest(manifest: IVersionManifest) {
    const assetsIndexPath = this.getAssetIndexPath(manifest);
    if (!assetsIndexPath) return [];

    const paths = [assetsIndexPath];

    if (!(await fs.pathExists(assetsIndexPath))) {
      return paths;
    }

    try {
      const assets: IAssetIndex = await fs.readJSON(assetsIndexPath, "utf-8");

      for (const value of Object.values(assets.objects ?? {})) {
        if (!value.hash) continue;

        const subHash = value.hash.substring(0, 2);
        paths.push(
          path.join(
            this.minecraftPath,
            "assets",
            "objects",
            subHash,
            value.hash,
          ),
        );
      }
    } catch {}

    return paths;
  }

  private async getOtherVersionManifestPaths() {
    const versionsPath = path.join(this.minecraftPath, "versions");
    const currentPath = this.normalizeResourcePath(this.versionPath);
    const directories = await fs.readdir(versionsPath).catch(() => []);
    const manifestPaths: string[] = [];

    for (const directory of directories) {
      const versionPath = path.join(versionsPath, directory);
      if (this.normalizeResourcePath(versionPath) === currentPath) continue;

      const stats = await fs.stat(versionPath).catch(() => null);
      if (!stats?.isDirectory()) continue;

      const files = await fs.readdir(versionPath).catch(() => []);
      for (const file of files) {
        if (!file.endsWith(".json") || file === "version.json") continue;
        manifestPaths.push(path.join(versionPath, file));
      }
    }

    return manifestPaths;
  }

  private async getOtherVersionResourcePaths(account: ILocalAccount) {
    const resourcePaths = new Set<string>();
    const manifestPaths = await this.getOtherVersionManifestPaths();

    for (const manifestPath of manifestPaths) {
      try {
        const manifest: IVersionManifest = await fs.readJSON(
          manifestPath,
          "utf-8",
        );

        for (const libraryPath of this.getLibraryPathsFromManifest(
          manifest,
          account,
        )) {
          resourcePaths.add(this.normalizeResourcePath(libraryPath));
        }

        for (const assetPath of await this.getAssetPathsFromManifest(
          manifest,
        )) {
          resourcePaths.add(this.normalizeResourcePath(assetPath));
        }
      } catch {}
    }

    return resourcePaths;
  }

  private getUnusedResourcePaths(
    resourcePaths: string[],
    usedByOtherVersions: Set<string>,
  ) {
    return getUnusedInstallResourcePaths(resourcePaths, usedByOtherVersions);
  }

  private removeDuplicateLibraries(
    libraries: IVersionManifest["libraries"],
    checkLibraries: string[],
  ): IVersionManifest["libraries"] {
    function compareVersions(version1: string, version2: string): number {
      const tokenize = (ver: string): (string | number)[] => {
        const parts = ver.split(/[-.]/);
        return parts.map((part) => {
          if (/^\d+$/.test(part)) return parseInt(part, 10);
          return part.toLowerCase();
        });
      };

      const v1Parts = tokenize(version1);
      const v2Parts = tokenize(version2);

      for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const part1 = v1Parts[i] ?? (typeof v1Parts[0] === "number" ? 0 : "");
        const part2 = v2Parts[i] ?? (typeof v2Parts[0] === "number" ? 0 : "");

        if (typeof part1 === "number" && typeof part2 === "number") {
          if (part1 < part2) return -1;
          if (part1 > part2) return 1;
        } else if (typeof part1 === "string" && typeof part2 === "string") {
          const cmp = part1.localeCompare(part2);
          if (cmp !== 0) return cmp;
        } else if (typeof part1 === "number") {
          return -1;
        } else if (typeof part2 === "number") {
          return 1;
        }
      }

      return 0;
    }

    const libraryMap = new Map<string, IVersionManifest["libraries"][0]>();
    const otherLibs: IVersionManifest["libraries"] = [];

    for (const lib of libraries) {
      const [groupId, artifactId] = lib.name.split(":");
      const key = `${groupId}:${artifactId}`;

      const shouldCheck = checkLibraries.some((checkLib) =>
        lib.name.startsWith(checkLib),
      );

      if (shouldCheck) {
        const existingLib = libraryMap.get(key);

        if (!existingLib) {
          libraryMap.set(key, lib);
        } else {
          const existingVersion = existingLib.name.split(":")[2];
          const currentVersion = lib.name.split(":")[2];
          if (compareVersions(currentVersion, existingVersion) > 0) {
            libraryMap.set(key, lib);
          }
        }
      } else {
        otherLibs.push(lib);
      }
    }

    return [...Array.from(libraryMap.values()), ...otherLibs];
  }

  private async readManifest() {
    const manifestPath = path.join(
      this.versionPath,
      `${this.version.version.id}.json`,
    );

    try {
      this.manifest = await fs.readJSON(manifestPath, "utf-8");

      if (this.manifest?.arguments?.game)
        for (let i = 0; i < this.manifest.arguments.game.length; i++) {
          const a = this.manifest.arguments.game[i];
          if (typeof a != "object") continue;
          if (!a.rules) continue;

          const rule = a.rules[0];
          const features = rule?.features;

          if (rule.action == "allow" && features?.is_quick_play_multiplayer)
            this.isQuickPlayMultiplayer = true;

          if (rule.action == "allow" && features?.is_quick_play_singleplayer)
            this.isQuickPlaySingleplayer = true;
        }
    } catch (error) {}
  }

  private async writeManifest() {
    if (!this.manifest) return;

    const manifestPath = path.join(
      this.versionPath,
      `${this.version.version.id}.json`,
    );
    await fs.writeJSON(manifestPath, this.manifest, {
      encoding: "utf-8",
      spaces: 2,
    });
  }

  private async getAssets() {
    if (!this.manifest) return { downloadItems: [], paths: [] };

    const downloadItems: DownloadItem[] = [];
    const paths: string[] = [];

    const assetsIndex = this.manifest.assetIndex;
    const assetsIndexPath = path.join(
      this.minecraftPath,
      "assets",
      "indexes",
      `${assetsIndex.id}.json`,
    );

    const existsIndex = await fs.pathExists(assetsIndexPath);
    if (!existsIndex) {
      return { downloadItems: [], paths: [] };
    }

    const assets: IAssetIndex = await fs.readJSON(assetsIndexPath, "utf-8");

    for (const [_, value] of Object.entries(assets.objects)) {
      const hash = value.hash;
      const subHash = hash.substring(0, 2);
      const assetPath = path.join(
        this.minecraftPath,
        "assets",
        "objects",
        subHash,
        hash,
      );

      paths.push(assetPath);
      downloadItems.push({
        url: `https://resources.download.minecraft.net/${subHash}/${hash}`,
        destination: assetPath,
        sha1: hash,
        size: value.size,
        group: "assets",
      });
    }

    return { downloadItems, paths };
  }

  private async getRunArguments(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    quickSingle?: string,
    quickMultiplayer?: string,
  ) {
    if (!this.manifest)
      return {
        jvm: [],
        game: [],
      };

    const platform = getOS();
    const separator = platform?.os == "windows" ? ";" : ":";

    const launcherPath = path.join(app.getPath("appData"), ".grubielauncher");

    const needsAuthlib =
      !!account.type && account.type != "microsoft" && account.type != "plain";
    const authlib = needsAuthlib ? await getAuthlibCached() : null;

    let jvm: string[] = [];
    let game: string[] = [];
    const httpAgent = HTTP_AGENT_JVM_ARGUMENT;

    if (
      account.type &&
      account.type != "microsoft" &&
      account.type != "plain" &&
      authlib
    ) {
      jvm.push(httpAgent);
      jvm.push(
        getJavaAgent(
          account.type,
          path.join(launcherPath, "minecraft", "libraries", authlib.path),
        ),
      );
    }

    if (this.isQuickPlaySingleplayer && quickSingle)
      game.push(...["--quickPlaySingleplayer", quickSingle]);

    const quickServerAddress = quickMultiplayer || this.version.quickServer;
    if (quickServerAddress) {
      if (this.isQuickPlayMultiplayer) {
        game.push("--quickPlayMultiplayer", quickServerAddress);
      } else if (
        this.manifest.type !== "old_alpha" &&
        this.manifest.type !== "old_beta"
      ) {
        const separatorIndex = quickServerAddress.lastIndexOf(":");
        const portCandidate =
          separatorIndex > 0
            ? quickServerAddress.slice(separatorIndex + 1)
            : "";
        const hasPort = /^\d+$/.test(portCandidate);
        const host = hasPort
          ? quickServerAddress.slice(0, separatorIndex)
          : quickServerAddress;

        game.push(
          "--server",
          host,
          "--port",
          hasPort ? portCandidate : "25565",
        );
      }
    }

    jvm.push(...buildMemoryArguments(settings.xmx, settings.optimizedJvm));

    if (this.manifest.minecraftArguments) {
      jvm.push(
        ...["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
      );
      game.push(...this.manifest.minecraftArguments.split(" "));
    }

    if (this.manifest.arguments?.jvm)
      for (const arg of this.manifest.arguments.jvm) {
        if (typeof arg === "string") {
          if (arg === httpAgent && jvm.includes(httpAgent)) continue;
          jvm.push(arg);
          continue;
        }

        if (arg.rules) {
          if (!matchesOsRules(arg.rules, platform) || !arg.value) continue;

          if (typeof arg.value == "string") jvm.push(arg.value);
          else jvm.push(...arg.value);
        }
      }

    if (this.manifest.arguments?.game)
      for (const arg of this.manifest.arguments.game) {
        if (typeof arg === "string") {
          game.push(arg);
          continue;
        }
      }

    jvm = jvm.filter((arg) => arg !== "");
    game = game.filter((arg) => arg !== "");

    const paths = [
      path.join(this.versionPath, `${this.version.version.id}.jar`),
      ...this.getLibraries(account).paths,
    ];

    jvm = jvm.map((arg) => {
      if (!this.manifest) return "";

      return arg
        .replace(
          /\${natives_directory}/g,
          path.join(this.versionPath, "natives"),
        )
        .replace(/\${launcher_name}/g, "GrubieLauncher")
        .replace(/\${launcher_version}/g, app.getVersion())
        .replace(/\${classpath}/g, paths.join(separator))
        .replace(
          /\${library_directory}/g,
          path.join(this.minecraftPath, "libraries"),
        )
        .replace(/\${classpath_separator}/g, separator)
        .replace(/\${version_name}/g, this.version.version.id);
    });

    if (!authData) {
      const uuid = await resolveOfflineUuid(this.versionPath, account.nickname);

      authData = {
        nickname: account.nickname,
        uuid,
        exp: 0,
        sub: uuid,
        auth: {
          accessToken: "0",
          refreshToken: "",
          expiresAt: 0,
          createdAt: 0,
        },
      };
    }

    game = game.map((arg) => {
      if (!this.manifest) return "";

      let accessToken = authData.auth.accessToken;
      if (account.type == "discord")
        accessToken = account.accessToken || authData.uuid;
      if (!accessToken) accessToken = "0";

      let accountType = "mojang";
      if (account.type == "microsoft") accountType = "msa";
      else if (account.type == "plain") accountType = "legacy";

      return arg
        .replace(/\${auth_player_name}/g, account.nickname || authData.nickname)
        .replace(/\${version_name}/g, this.version.version.id)
        .replace(/\${game_directory}/g, this.versionPath)
        .replace(/\${assets_root}/g, path.join(this.minecraftPath, "assets"))
        .replace(/\${assets_index_name}/g, this.manifest.assetIndex.id)
        .replace(/\${auth_uuid}/g, authData.uuid)
        .replace(/\${auth_access_token}/g, accessToken)
        .replace(/\${clientid}/g, "grubie-launcher")
        .replace(/\${auth_xuid}/g, authData.uuid)
        .replace(/\${user_type}/g, accountType)
        .replace(/\${version_type}/g, this.manifest.type)
        .replace(/\${user_properties}/g, "{}");
    });

    if (this.version.runArguments) {
      jvm.push(...parseCustomRunArguments(this.version.runArguments.jvm));
      game.push(...parseCustomRunArguments(this.version.runArguments.game));
    }

    return { jvm, game };
  }

  public async getRunCommand(
    account: ILocalAccount,
    settings: TSettings,
    isRelative: boolean = false,
    authData: IAuth | null = null,
    quickSingle?: string,
    quickMultiplayer?: string,
  ) {
    await this.ensureInitialized();

    if (!this.manifest || !this.javaPath) return null;

    const runArguments = await this.getRunArguments(
      account,
      settings,
      authData,
      quickSingle,
      quickMultiplayer,
    );

    const command = [
      this.javaPath,
      ...runArguments.jvm,
      this.manifest.mainClass,
      ...runArguments.game,
    ];

    const normalizePath = (path: string) => path.replace(/\\/g, "/");

    if (isRelative) {
      command[0] = command[0].replace(this.javaPath, "${javaPath}");
      for (let i = 1; i < command.length; i++) {
        const normalized = normalizePath(command[i]);
        const normalizedMinecraftPath = normalizePath(this.minecraftPath);
        command[i] = normalized.replaceAll(
          normalizedMinecraftPath,
          "${minecraftPath}",
        );
      }
    }

    return command;
  }

  public async ensureAuthlib(
    account: ILocalAccount,
  ): Promise<AuthlibEnsureResult> {
    if (account.type == "microsoft" || account.type == "plain")
      return { ok: true };

    await this.ensureInitialized();
    if (!this.manifest) return { ok: true };

    const authlib = await getAuthlibCached();
    if (!authlib) return { ok: false, reason: "unavailable" };

    const existsAuthlib = this.manifest.libraries.some(
      (lib) => lib.name === authlib.name,
    );

    if (!existsAuthlib) {
      this.manifest.libraries.push({
        name: authlib.name,
        downloads: {
          artifact: {
            url: authlib.url,
            path: authlib.path,
            size: authlib.size,
            sha1: authlib.sha1,
          },
        },
      });

      await this.writeManifest();
    }

    const authlibPath = path.join(
      this.minecraftPath,
      "libraries",
      authlib.path,
    );

    if (await fs.pathExists(authlibPath)) return { ok: true };

    try {
      await this.downloader.downloadFiles([
        {
          url: authlib.url,
          destination: authlibPath,
          sha1: authlib.sha1,
          size: authlib.size,
          group: "libraries",
          options: { silent: true },
        },
      ]);
    } catch (error) {
      console.error(
        "[version:run] failed to download authlib-injector:",
        error,
      );
      return { ok: false, reason: "download_failed" };
    }

    return { ok: true };
  }

  public async run(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    instance: number,
    quick: {
      single?: string;
      multiplayer?: string;
    },
  ) {
    await this.ensureInitialized();
    if (!(await this.ensureAuthlib(account)).ok) return false;

    const command = await this.getRunCommand(
      account,
      settings,
      false,
      authData,
      quick.single,
      quick.multiplayer,
    );
    if (!command) return false;

    const trackStatistics =
      !!this.version.owner &&
      `${account.type}_${account.nickname}` === this.version.owner;

    runGame(
      command[0],
      command.slice(1),
      this.versionPath,
      this.version.name,
      instance,
      account.accessToken || "",
      quick.multiplayer || this.version.quickServer,
      {
        trackStatistics,
        accountSub: authData?.sub ?? null,
        accountLabel: account.nickname,
      },
      settings.highPriority,
    );

    return true;
  }

  private async writeLauncherProfile() {
    const data = {
      profiles: {},
      clientToken: "",
      authenticationDatabase: {},
      selectedUser: "",
      launcherVersion: {
        name: "1.5.3",
        format: 17,
      },
    };

    await fs.writeJSON(
      path.join(this.versionPath, "temp", "launcher_profiles.json"),
      data,
      {
        encoding: "utf-8",
        spaces: 2,
      },
    );
  }

  private async findInstalledLoaderManifestPath(
    versionsPath: string,
    expectedName: string,
  ) {
    const expectedPath = path.join(
      versionsPath,
      expectedName,
      `${expectedName}.json`,
    );

    if (await fs.pathExists(expectedPath)) return expectedPath;

    const versionDirs = await fs.readdir(versionsPath).catch(() => []);
    const loaderName = this.version.loader.name.toLowerCase();

    for (const dirName of versionDirs) {
      const candidatePath = path.join(versionsPath, dirName, `${dirName}.json`);
      if (!(await fs.pathExists(candidatePath))) continue;
      if (dirName.toLowerCase().includes(loaderName)) return candidatePath;
    }

    for (const dirName of versionDirs) {
      const candidatePath = path.join(versionsPath, dirName, `${dirName}.json`);
      if (!(await fs.pathExists(candidatePath))) continue;

      try {
        const manifest: IVersionManifest = await fs.readJSON(
          candidatePath,
          "utf-8",
        );
        const libraries = manifest.libraries ?? [];
        const hasLoaderLibrary = libraries.some((lib) => {
          const name = lib.name.toLowerCase();
          return (
            name.includes("minecraftforge") ||
            name.includes("neoforged") ||
            name.includes("neoforge")
          );
        });

        if (manifest.mainClass && hasLoaderLibrary) return candidatePath;
      } catch {}
    }

    return null;
  }

  public async delete(account: ILocalAccount, isFull: boolean = false) {
    await this.ensureInitialized();

    if (!isFull) {
      await fs.remove(this.versionPath);
      return true;
    }

    const libraries = this.getLibraries(account);
    const assets = await this.getAssets();
    const assetIndexPath = this.manifest
      ? this.getAssetIndexPath(this.manifest)
      : null;
    const usedByOtherVersions =
      await this.getOtherVersionResourcePaths(account);
    const removableResources = this.getUnusedResourcePaths(
      [
        ...libraries.paths,
        ...assets.paths,
        ...(assetIndexPath ? [assetIndexPath] : []),
      ],
      usedByOtherVersions,
    );

    if (removableResources.length) {
      await Promise.all(
        removableResources.map((resource) => fs.remove(resource)),
      );
    }
    await fs.remove(this.versionPath);

    return true;
  }
}
