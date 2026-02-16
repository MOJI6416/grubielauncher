import { Servers } from "@renderer/components/ServerList/Servers";
import { ILocalProject } from "@/types/ModManager";
import {
  accountAtom,
  authDataAtom,
  consolesAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
  versionsAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { IArguments } from "@/types/IArguments";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CloudCog,
  CloudDownload,
  CopyCheck,
  CopySlash,
  Cpu,
  Earth,
  Folder,
  FolderArchive,
  Gamepad2,
  ImageMinus,
  ImagePlus,
  Pencil,
  Save,
  ScanLine,
  Server,
  ServerCog,
  Share2,
  SquareTerminal,
  Trash,
  X,
} from "lucide-react";
import { loaders } from "@renderer/components/Loaders";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { VersionDiffence } from "@renderer/components/Versions";
import { IServerOption } from "@/types/Server";
import { IModpack } from "@/types/Backend";
import { Share as ShareModal } from "@renderer/components/Modals/Version/Share/Share";
import { CreateServer } from "../../ServerControl/Create";
import { Export } from "@renderer/components/Export";
import { ImageCropper } from "@renderer/components/ImageCropper";
import { ModManager } from "@renderer/components/ModManager/ModManager";
import { Arguments } from "@renderer/components/Arguments";
import { Confirmation } from "../Confirmation";
import { ServerControl } from "@renderer/components/ServerControl/Control";
import { DeleteVersion } from "./DeleteVersion";
import {
  addToast,
  Button,
  ButtonGroup,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Image,
  Tooltip,
  Chip,
} from "@heroui/react";
import { BlockedMods, checkBlockedMods, IBlockedMod } from "../BlockedMods";
import { IServer } from "@/types/ServersList";
import { Worlds } from "@renderer/components/Worlds/WorldsModal";
import { RunGameParams } from "@renderer/App";
import {
  checkDiffenceUpdateData,
  checkVersionName,
  syncShare,
} from "@renderer/utilities/version";
import { Mods } from "@renderer/classes/Mods";

const api = window.api;

export function EditVersion({
  closeModal,
  vd,
  runGame,
}: {
  closeModal: () => void;
  vd?: VersionDiffence;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const [account] = useAtom(accountAtom);
  const [version, setVersion] = useAtom(selectedVersionAtom);
  const [versions] = useAtom(versionsAtom);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<
    "save" | "check_diff" | "sync" | "server" | "check"
  >();

  const [notSavedModal, setNotSavedModal] = useState(false);
  const [servers, setServers] = useState<IServer[]>([]);
  const [nbtServers, setNbtServers] = useAtom(versionServersAtom);

  const [versionName, setVersionName] = useState("");
  const [mods, setMods] = useState<ILocalProject[]>([]);
  const [runArguments, setRunArguments] = useState<IArguments>({
    game: "",
    jvm: "",
  });
  const [image, setImage] = useState("");
  const [editName, setEditName] = useState(false);

  const [isCropping, setIsCropping] = useState(false);
  const [croppedImage, setCroppedImage] = useState("");

  const [isServers, setIsServers] = useState(false);
  const [isModManager, setIsModManager] = useState(false);

  const [isNetwork] = useAtom(networkAtom);
  const [isOpenArguments, setIsOpenArguments] = useState(false);

  const [paths] = useAtom(pathsAtom);
  const [isOpenDel, setIsOpenDel] = useState(false);

  const [settings] = useAtom(settingsAtom);
  const [server, setServer] = useAtom(serverAtom);

  const [isOpenShareModal, setIsOpenModalShare] = useState(false);
  const [shareType, setShareType] = useState<"new" | "update">("new");
  const [isShareModal, setShareModal] = useState(false);

  const [versionDiffence, setVersionDiffence] = useState<
    "sync" | "new" | "old"
  >("sync");
  const [diffenceUpdateData, setDiffenceUpdateData] = useState<string>("");

  const [tempModpack, setTempModpack] = useState<IModpack>();
  const [isOpenExportModal, setIsOpenExportModal] = useState(false);

  const [isServerManager, setIsServerManager] = useState(false);
  const [serverCores, setServerCores] = useState<IServerOption[]>([]);
  const [isServerCreate, setIsServerCreate] = useState(false);

  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);

  const { t } = useTranslation();

  const [isLogoChanged, setIsLogoChanged] = useState(false);
  const [quickConnectIp, setQuickConnectIp] = useState<string>();

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [blockedCloseType, setBlockedCloseType] = useState<"save" | "check">();

  const [authData] = useAtom(authDataAtom);
  const [, setConsoles] = useAtom(consolesAtom);

  const [isOpenWorlds, setIsOpenWorlds] = useState(false);

  const [hasChanges, setHasChanges] = useState(false);
  const calcSeqRef = useRef(0);

  const [hasSaves, setHasSaves] = useState(false);
  const [isCheckingSaves, setIsCheckingSaves] = useState(false);

  useEffect(() => {
    (async () => {
      if (!version) return;

      setImage(version.version.image);
      setVersionName(version.version.name);
      setMods(version.version.loader.mods || []);
      setRunArguments(version.version.runArguments || { game: "", jvm: "" });
      setServers(version.version.version.serverManager ? nbtServers : []);
      setQuickConnectIp(version.version.quickServer);

      vd && setVersionDiffence(vd);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!version) {
        setHasSaves(false);
        return;
      }

      setIsCheckingSaves(true);
      try {
        const worldsPath = await api.path.join(version.versionPath, "saves");
        const exists = await api.fs.pathExists(worldsPath);
        if (!cancelled) setHasSaves(exists);
      } catch {
        if (!cancelled) setHasSaves(false);
      } finally {
        if (!cancelled) setIsCheckingSaves(false);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [version?.versionPath]);

  const isNameValid = useMemo(() => {
    if (!version) return false;
    const next = versionName.trim();
    const current = version.version.name;
    if (next === current) return true;
    return checkVersionName(
      next,
      versions.map((v) => v.version),
      version.version,
    );
  }, [version, versionName, versions]);

  const canSave = useMemo(() => {
    if (!version) return false;
    if (isLoading) return false;
    if (!hasChanges) return false;
    if (!isNameValid) return false;
    if (version.version.owner && account && !isOwnerVersion) return false;
    return true;
  }, [version, isLoading, hasChanges, isNameValid, account, isOwnerVersion]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++calcSeqRef.current;

    const calc = async () => {
      if (!version) {
        setHasChanges(false);
        return;
      }

      if (isLoading) return;

      const nameChanged = versionName.trim() !== (version.version.name ?? "");

      const argsChanged =
        runArguments.game !== (version.version.runArguments?.game ?? "") ||
        runArguments.jvm !== (version.version.runArguments?.jvm ?? "");

      const otherChanged =
        isLogoChanged || version.version.quickServer !== quickConnectIp;

      let modsChanged = false;
      let serversChanged = false;

      try {
        modsChanged = !(await api.modManager.compareMods(
          version.version.loader.mods ?? [],
          mods,
        ));
      } catch {
        modsChanged = false;
      }

      if (version.version.version.serverManager) {
        try {
          serversChanged = !(await api.servers.compare(nbtServers, servers));
        } catch {
          serversChanged = false;
        }
      }

      if (cancelled || seq !== calcSeqRef.current) return;

      setHasChanges(
        nameChanged ||
          modsChanged ||
          serversChanged ||
          argsChanged ||
          otherChanged,
      );
    };

    calc();

    return () => {
      cancelled = true;
    };
  }, [
    version,
    versionName,
    mods,
    servers,
    nbtServers,
    runArguments.game,
    runArguments.jvm,
    isLogoChanged,
    quickConnectIp,
    isLoading,
  ]);

  async function sync() {
    if (!version) return;

    await syncShare(version, servers, settings, account?.accessToken || "");

    setLoadingType(undefined);
    setIsLoading(false);

    addToast({
      color: "success",
      title: t("versions.updated"),
    });

    closeModal();
  }

  async function checkIntegrity() {
    if (!version || !account) return;

    setLoadingType("check");
    setIsLoading(true);

    try {
      await version.install(account);

      const versionMods = new Mods(settings, version.version, server);
      await versionMods.check();

      addToast({
        color: "success",
        title: t("versions.integrityOk"),
      });
    } catch {
      addToast({
        color: "danger",
        title: t("versions.integrityError"),
      });
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  async function saveVersion() {
    if (!version) return;

    let isShare = false;

    setLoadingType("save");
    setIsLoading(true);

    let isRename = false;
    const oldPath = version.versionPath;
    if (versionName.trim() !== version.version.name) {
      const versionsPath = await api.path.join(paths.minecraft, "versions");
      const oldName = version.version.name;

      const newName = versionName.trim();
      const newPath = await api.path.join(versionsPath, newName);

      try {
        await api.fs.rename(version.versionPath, newPath);

        isRename = true;

        setConsoles((prev) => ({
          consoles: prev.consoles.filter((c) => c.versionName !== oldName),
        }));

        version.version.name = newName;
        await version.init();

        isShare = true;
      } catch {
        addToast({
          color: "danger",
          title: t("versions.renameError"),
        });

        setIsLoading(false);
        setLoadingType(undefined);

        setHasChanges(false);
        return;
      } finally {
        setEditName(false);
      }
    }

    if (
      !(await api.modManager.compareMods(
        version.version.loader.mods || [],
        mods,
      ))
    ) {
      version.version.loader.mods = mods;

      for (const bMod of blockedMods) {
        if (!bMod.filePath) continue;

        const mod = mods.find((m) => m.id === bMod.projectId);

        if (!mod || !mod.version) continue;

        mod.version.files[0].localPath = bMod.filePath;
      }

      const versionMods = new Mods(settings, version.version, server);
      await versionMods.check();

      isShare = true;
      setBlockedMods([]);
    }

    if (version.version.version.serverManager) {
      try {
        const serversPath = await api.path.join(
          version.versionPath,
          "servers.dat",
        );

        if (!(await api.servers.compare(nbtServers, servers))) {
          await api.servers.write(servers, serversPath);
          setNbtServers([...servers]);
          isShare = true;
        }
      } catch {}
    }

    version.version.lastUpdate = new Date();

    if (
      runArguments.game !== (version.version.runArguments?.game || "") ||
      runArguments.jvm !== (version.version.runArguments?.jvm || "")
    ) {
      version.version.runArguments = { ...runArguments };
      isShare = true;
    }

    if (isLogoChanged || (isRename && !isDownloadedVersion && isOwnerVersion)) {
      const filename = "logo.png";
      const filePath = await api.path.join(version.versionPath, filename);

      let fileUrl = "";
      if (image) {
        let img = image;
        if (isRename && !isDownloadedVersion && isOwnerVersion) {
          img = img.replace(oldPath, version.versionPath);
        }

        const newFile = await fetch(img).then((r) => r.blob());
        await api.fs.writeFile(
          filePath,
          new Uint8Array(await newFile.arrayBuffer()),
          "binary",
        );

        fileUrl = `file://${filePath}?t=${new Date().getTime()}`;

        setImage(fileUrl);
      } else {
        await api.fs.rimraf(filePath);
      }

      version.version.image = fileUrl;
      isShare = true;
    }

    if (quickConnectIp !== version.version.quickServer) {
      version.version.quickServer = quickConnectIp;
      isShare = true;
    }

    await version.save();

    try {
      await api.fs.rimraf(await api.path.join(version.versionPath, "temp"));
    } catch {}

    addToast({
      title: t("versions.updated"),
      color: "success",
    });

    setIsLogoChanged(false);
    setLoadingType(undefined);
    setIsLoading(false);

    if (
      isShare &&
      version.version.shareCode &&
      !version.version.downloadedVersion &&
      isNetwork
    ) {
      setIsOpenModalShare(true);
    }
  }

  return (
    <>
      <Modal
        scrollBehavior="outside"
        isOpen={true}
        size="3xl"
        onClose={() => {
          if (isLoading) return;

          if (hasChanges) {
            setNotSavedModal(true);
            return;
          }

          closeModal();
        }}
      >
        <ModalContent>
          <ModalHeader>{t("versions.versionSettings")}</ModalHeader>
          <ModalBody>
            <div className={`flex flex-col gap-4`}>
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {image && (
                    <Image
                      src={image}
                      alt={"logo"}
                      width={64}
                      height={64}
                      className="min-w-16 min-h-16"
                      onClick={() => {
                        if (!image || isDownloadedVersion) return;
                      }}
                    />
                  )}

                  {editName ? (
                    <Input
                      size="sm"
                      startContent={
                        !isNameValid ? (
                          <CircleAlert className="text-warning" size={22} />
                        ) : (
                          ""
                        )
                      }
                      placeholder={t("versions.namePlaceholder")}
                      value={versionName}
                      onChange={(event) =>
                        setVersionName(event.currentTarget.value)
                      }
                      isDisabled={isLoading}
                    />
                  ) : (
                    <p className="truncate flex-grow text-xl font-semibold">
                      {versionName}
                    </p>
                  )}

                  <div className="flex items-center gap-1">
                    {!version?.version.downloadedVersion && (
                      <div className="flex items-center gap-1">
                        {!editName && (
                          <Button
                            variant="flat"
                            isIconOnly
                            size="sm"
                            isDisabled={isLoading || !isOwnerVersion}
                            onPress={() => setEditName(true)}
                          >
                            <Pencil size={20} />
                          </Button>
                        )}
                        {editName && (
                          <Button
                            isIconOnly
                            onPress={() => {
                              setEditName(false);
                              setVersionName(version?.version.name || "");
                            }}
                            variant="flat"
                            size="sm"
                          >
                            <X size={20} />
                          </Button>
                        )}
                        <Button
                          variant="flat"
                          isIconOnly
                          size="sm"
                          isDisabled={isLoading || !isOwnerVersion}
                          onPress={async () => {
                            const filePaths = await api.other.openFileDialog();
                            if (!filePaths || filePaths.length === 0) return;
                            setCroppedImage(filePaths[0]);
                            setIsCropping(true);
                          }}
                        >
                          <ImagePlus size={20} />
                        </Button>
                        {image && (
                          <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            isDisabled={isLoading || !isOwnerVersion}
                            onPress={() => {
                              setImage("");
                              setIsLogoChanged(true);
                            }}
                          >
                            <ImageMinus size={20} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {version && (
                  <div className="flex items-center gap-1 m-auto">
                    <Chip variant="flat">
                      <div className="flex items-center gap-1">
                        <Gamepad2 size={20} />
                        <p className="text-sm">{version.version.version.id}</p>
                      </div>
                    </Chip>

                    <Chip variant="flat">
                      <div className="flex items-center gap-1">
                        <Cpu size={20} />
                        <p
                          className={loaders[version.version.loader.name].style}
                        >
                          {loaders[version.version.loader.name].name}
                        </p>
                        {version.version.loader.name !== "vanilla" && (
                          <p>({version.version.loader.version?.id})</p>
                        )}
                      </div>
                    </Chip>

                    {version.version.shareCode && (
                      <Chip
                        variant="flat"
                        className="cursor-pointer m-auto"
                        onClick={async () => {
                          await api.clipboard.writeText(
                            version.version.shareCode || "",
                          );
                          addToast({ title: t("common.copied") });
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Share2 size={20} />
                          {version.version.shareCode}
                        </div>
                      </Chip>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 m-auto">
                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      isDisabled={!version || isLoading || !isNetwork}
                      startContent={
                        <div className="flex items-center gap-1">
                          <SiCurseforge size={22} />
                          <SiModrinth size={22} />
                        </div>
                      }
                      onPress={() => setIsModManager((prev) => !prev)}
                    >
                      {t("modManager.title")}
                    </Button>
                  </span>

                  {version?.version.version?.serverManager && (
                    <span>
                      <Button
                        variant="flat"
                        isDisabled={!version || isLoading}
                        startContent={<Server size={22} />}
                        onPress={() => setIsServers(true)}
                      >
                        {t("versions.servers")}
                      </Button>
                    </span>
                  )}

                  <span>
                    <Button
                      variant="flat"
                      isDisabled={
                        !version || isLoading || isCheckingSaves || !hasSaves
                      }
                      startContent={<Earth size={22} />}
                      onPress={() => setIsOpenWorlds(true)}
                    >
                      {t("worlds.title")}
                    </Button>
                  </span>
                </div>

                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      isDisabled={
                        (version?.version.downloadedVersion &&
                          runArguments.game === "" &&
                          runArguments.jvm === "") ||
                        isLoading
                      }
                      startContent={<SquareTerminal size={22} />}
                      onPress={() => setIsOpenArguments(true)}
                    >
                      {t("arguments.title")}
                    </Button>
                  </span>

                  <span>
                    <Button
                      variant="flat"
                      startContent={<Folder size={22} />}
                      onPress={async () => {
                        if (!version) return;
                        await api.shell.openPath(
                          await api.path.join(
                            paths.minecraft,
                            "versions",
                            version.version.name,
                          ),
                        );
                      }}
                    >
                      {t("common.openFolder")}
                    </Button>
                  </span>

                  <span>
                    <Button
                      variant="flat"
                      isDisabled={isLoading || !isNetwork}
                      isLoading={isLoading && loadingType === "check"}
                      startContent={<ScanLine size={22} />}
                      onPress={async () => {
                        if (!version) return;

                        const b = await checkBlockedMods(
                          mods,
                          version.versionPath,
                        );
                        if (b.length > 0) {
                          setBlockedMods(b);
                          setIsBlockedMods(true);
                          setBlockedCloseType("check");
                          return;
                        }

                        await checkIntegrity();
                      }}
                    >
                      {t("versions.checkIntegrity")}
                    </Button>
                  </span>
                </div>

                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      color={"success"}
                      startContent={<Save size={22} />}
                      isDisabled={!canSave}
                      isLoading={isLoading && loadingType === "save"}
                      onPress={async () => {
                        if (!version) return;

                        const b = await checkBlockedMods(
                          mods,
                          version.versionPath,
                        );
                        if (b.length > 0) {
                          setBlockedMods(b);
                          setIsBlockedMods(true);
                          setBlockedCloseType("save");
                          return;
                        }

                        await saveVersion();
                      }}
                    >
                      {t("common.save")}
                    </Button>
                  </span>

                  <span>
                    <Button
                      color="danger"
                      variant="flat"
                      isDisabled={
                        isLoading ||
                        (!!version?.version.owner && account && !isOwnerVersion)
                      }
                      startContent={<Trash size={22} />}
                      onPress={() => setIsOpenDel(true)}
                    >
                      {t("common.delete")}
                    </Button>
                  </span>
                </div>

                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      isDisabled={isLoading}
                      startContent={<FolderArchive size={22} />}
                      onPress={() => setIsOpenExportModal(true)}
                    >
                      {t("export.btn")}
                    </Button>
                  </span>

                  {settings?.devMode && (
                    <ButtonGroup>
                      <Tooltip
                        content={t("versions.copyAbsolutePath")}
                        delay={1000}
                      >
                        <Button
                          variant="flat"
                          className="w-full"
                          startContent={<CopyCheck size={22} />}
                          isDisabled={isLoading}
                          onPress={async () => {
                            if (!version || !account) return;
                            const command = await version.getRunCommand(
                              account,
                              authData,
                            );
                            if (!command) return;
                            await api.clipboard.writeText(command.join(" "));
                            addToast({ title: t("common.copied") });
                          }}
                        >
                          {t("versions.copyRunComand")}
                        </Button>
                      </Tooltip>

                      <Tooltip
                        content={t("versions.copyRelativePath")}
                        delay={1000}
                      >
                        <Button
                          variant="flat"
                          isIconOnly
                          isDisabled={isLoading}
                          onPress={async () => {
                            if (!version || !account) return;
                            const command = await version.getRunCommand(
                              account,
                              authData,
                              true,
                            );
                            if (!command) return;
                            await api.clipboard.writeText(command.join(" "));
                            addToast({ title: t("common.copied") });
                          }}
                        >
                          <CopySlash size={22} />
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  )}
                </div>

                <div className="flex items-center gap-2 m-auto">
                  {version && !version.version.shareCode && (
                    <span>
                      <Button
                        variant="flat"
                        isDisabled={
                          hasChanges ||
                          isLoading ||
                          (version.version.owner &&
                            account &&
                            !isOwnerVersion) ||
                          !isNetwork ||
                          account?.type === "plain"
                        }
                        startContent={<Share2 size={22} />}
                        onPress={async () => {
                          setShareType("new");
                          setShareModal(true);
                        }}
                      >
                        {t("versions.share")}
                      </Button>
                    </span>
                  )}

                  {versionDiffence === "new" &&
                    !version?.version.downloadedVersion &&
                    version?.version.shareCode && (
                      <span>
                        <ButtonGroup>
                          <Button
                            variant="flat"
                            className="w-full"
                            color={"primary"}
                            isDisabled={
                              hasChanges ||
                              isLoading ||
                              !isNetwork ||
                              !isOwnerVersion
                            }
                            startContent={<CloudCog size={22} />}
                            isLoading={
                              isLoading && loadingType === "check_diff"
                            }
                            onPress={async () => {
                              if (!account || !version.version.shareCode)
                                return;

                              try {
                                setIsLoading(true);
                                setLoadingType("check_diff");

                                const diff = await checkDiffenceUpdateData(
                                  {
                                    mods: version.version.loader.mods,
                                    runArguments: version.version
                                      .runArguments || {
                                      game: "",
                                      jvm: "",
                                    },
                                    servers,
                                    version: version.version,
                                    versionPath: await api.path.join(
                                      paths.minecraft,
                                      "versions",
                                      version.version.name,
                                    ),
                                    logo: image || "",
                                    quickServer: quickConnectIp,
                                  },
                                  account.accessToken || "",
                                );

                                setDiffenceUpdateData(diff);

                                if (!diff) {
                                  setVersionDiffence("sync");
                                  throw new Error("not found diff");
                                }

                                const modpackData =
                                  await api.backend.getModpack(
                                    account.accessToken!,
                                    version.version.shareCode,
                                  );

                                if (!modpackData.data)
                                  throw new Error("not found modpack");

                                setTempModpack(modpackData.data);
                                setShareType("update");
                                setShareModal(true);
                              } catch {
                              } finally {
                                setIsLoading(false);
                                setLoadingType(undefined);
                              }
                            }}
                          >
                            {t("versions.publish")}
                          </Button>

                          <Tooltip
                            content={t("versions.synchronizeDescription")}
                            delay={1000}
                          >
                            <Button
                              variant="flat"
                              isIconOnly
                              color={"primary"}
                              isDisabled={
                                hasChanges ||
                                isLoading ||
                                !isNetwork ||
                                !isOwnerVersion
                              }
                              isLoading={isLoading && loadingType === "sync"}
                              onPress={async () => {
                                if (!account) return;
                                setLoadingType("sync");
                                setIsLoading(true);
                                await sync();
                              }}
                            >
                              <CloudDownload size={22} />
                            </Button>
                          </Tooltip>
                        </ButtonGroup>
                      </span>
                    )}

                  {versionDiffence === "old" &&
                    version?.version.downloadedVersion && (
                      <Tooltip content={t("versions.synchronizeDescription")}>
                        <span>
                          <Button
                            variant="flat"
                            color="primary"
                            startContent={<CloudDownload size={22} />}
                            isDisabled={hasChanges || isLoading || !isNetwork}
                            isLoading={isLoading && loadingType === "sync"}
                            onPress={async () => {
                              if (!account) return;
                              setLoadingType("sync");
                              setIsLoading(true);
                              await sync();
                            }}
                          >
                            {t("versions.synchronize")}
                          </Button>
                        </span>
                      </Tooltip>
                    )}

                  {!version?.version.downloadedVersion && (
                    <span>
                      <Button
                        variant="flat"
                        isDisabled={
                          isLoading ||
                          (!!version?.version.owner &&
                            account &&
                            !isOwnerVersion) ||
                          (!server && !isNetwork)
                        }
                        isLoading={isLoading && loadingType === "server"}
                        startContent={<ServerCog size={22} />}
                        onPress={async () => {
                          if (!version) return;

                          if (server) {
                            setIsServerManager(true);
                            return;
                          }

                          setLoadingType("server");
                          setIsLoading(true);

                          const cores = await api.servers.get(
                            version.version.version.id,
                            version.version.loader.name,
                          );

                          if (!cores.length) {
                            setIsLoading(false);
                            setLoadingType(undefined);
                            addToast({
                              color: "danger",
                              title: t("versions.notFoundServerCore"),
                            });
                            return;
                          }

                          setServerCores(cores);
                          setIsServerCreate(true);

                          setIsLoading(false);
                          setLoadingType(undefined);
                        }}
                      >
                        {t("versions.serverManager")}
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {isShareModal && (
        <ShareModal
          closeModal={() => setShareModal(false)}
          shareType={shareType}
          modpack={tempModpack}
          diffenceUpdateData={diffenceUpdateData}
        />
      )}

      {isServerCreate && (
        <CreateServer
          close={() => setIsServerCreate(false)}
          serverCores={serverCores}
        />
      )}

      {isOpenExportModal && version && (
        <Export
          onClose={() => setIsOpenExportModal(false)}
          versionPath={version.versionPath}
        />
      )}

      {isCropping && (
        <ImageCropper
          onClose={() => {
            setIsCropping(false);
            setCroppedImage("");
          }}
          title={t("common.editingLogo")}
          image={croppedImage}
          size={{ width: 256, height: 256 }}
          changeImage={async (url: string) => {
            setImage(url);
            setIsLogoChanged(true);
          }}
        />
      )}

      {isModManager && version && (
        <ModManager
          mods={mods}
          setMods={(m: ILocalProject[]) => setMods(m)}
          onClose={() => setIsModManager(false)}
          loader={version.version.loader.name}
          version={version.version.version}
          isModpacks={false}
          setLoader={() => {}}
          setModpack={() => {}}
          setVersion={() => {}}
        />
      )}

      {isServers && version && (
        <Servers
          quickConnectIp={quickConnectIp}
          setQuickConnectIp={setQuickConnectIp}
          closeModal={(isFull?: boolean) => {
            if (isFull) closeModal();
            else setIsServers(false);
          }}
          servers={servers}
          setServers={setServers}
          runGame={runGame}
        />
      )}

      {isOpenArguments && version && (
        <Arguments
          runArguments={runArguments}
          onClose={() => setIsOpenArguments(false)}
          setArguments={setRunArguments}
        />
      )}

      {notSavedModal && (
        <Confirmation
          content={[{ text: t("versions.notSaved"), color: "warning" }]}
          onClose={() => setNotSavedModal(false)}
          title={t("common.confirmation")}
          buttons={[
            {
              text: t("versions.willReturn"),
              onClick: async () => setNotSavedModal(false),
            },
            {
              color: "danger",
              text: t("common.close"),
              onClick: async () => closeModal(),
            },
          ]}
        />
      )}

      {isServerManager && version && (
        <ServerControl
          onClose={() => setIsServerManager(false)}
          onDelete={() => setServer(undefined)}
        />
      )}

      {isOpenShareModal && (
        <Confirmation
          content={[{ text: t("versions.publicUpdate") }]}
          onClose={() => setIsOpenModalShare(false)}
          buttons={[
            {
              text: t("common.yes"),
              color: "primary",
              onClick: async () => {
                if (!account || !version || !version.version.shareCode) return;

                try {
                  setIsLoading(true);
                  setLoadingType("check_diff");

                  const diff = await checkDiffenceUpdateData(
                    {
                      mods: version.version.loader.mods,
                      runArguments: version.version.runArguments || {
                        game: "",
                        jvm: "",
                      },
                      servers,
                      version: version.version,
                      versionPath: version.versionPath,
                      logo: image || "",
                      quickServer: quickConnectIp,
                    },
                    account.accessToken || "",
                  );

                  if (!diff) {
                    setIsOpenModalShare(false);
                    setVersionDiffence("sync");
                    throw new Error("not found diff");
                  }

                  const modpackData = await api.backend.getModpack(
                    account.accessToken!,
                    version.version.shareCode,
                  );
                  if (!modpackData.data) throw new Error("not found modpack");

                  setDiffenceUpdateData(diff);
                  setTempModpack(modpackData.data);
                  setIsOpenModalShare(false);
                  setShareType("update");
                  setShareModal(true);
                } catch {
                } finally {
                  setIsLoading(false);
                  setLoadingType(undefined);
                }
              },
              loading: isLoading && loadingType === "check_diff",
            },
            {
              text: t("common.no"),
              onClick: async () => setIsOpenModalShare(false),
            },
          ]}
        />
      )}

      {isOpenDel && (
        <DeleteVersion
          close={(isDeleted?: boolean) => {
            setIsOpenDel(false);
            if (isDeleted) {
              setVersion(undefined);
              closeModal();
            }
          }}
        />
      )}

      {isBlockedMods && blockedMods.length > 0 && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (bMods) => {
            setBlockedMods(bMods);
            setIsBlockedMods(false);

            if (blockedCloseType === "save") await saveVersion();
            if (blockedCloseType === "check") await checkIntegrity();

            setBlockedCloseType(undefined);
          }}
        />
      )}

      {isOpenWorlds && (
        <Worlds
          onClose={(isFull) => {
            if (isFull) closeModal();
            else setIsOpenWorlds(false);
          }}
          runGame={runGame}
        />
      )}
    </>
  );
}
