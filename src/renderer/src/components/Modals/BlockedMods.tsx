import {
  Alert,
  Button,
  Card,
  CardBody,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import { ExternalLink, Eye } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

const api = window.api;

export interface IBlockedMod {
  projectId: string;
  fileName: string;
  hash: string;
  url: string;
  filePath?: string;
}

export async function checkBlockedMods(
  mods: ILocalProject[],
  versionPath?: string,
) {
  if (mods.length === 0) return [];

  const blockedMods: IBlockedMod[] = [];

  for (const mod of mods) {
    if (mod.provider !== Provider.CURSEFORGE) continue;
    const file = mod.version?.files[0];
    if (!file?.url) continue;

    if (!file.url.startsWith("blocked::")) continue;

    if (versionPath) {
      let folderName = await api.modManager.ptToFolder(mod.projectType);
      if (mod.projectType === ProjectType.WORLD) {
        folderName = await api.path.join("storage", "worlds");
      }
      const filePath = await api.path.join(
        versionPath,
        folderName,
        file.filename,
      );
      const isExists = await api.fs.pathExists(filePath);
      if (isExists) continue;
    }

    blockedMods.push({
      fileName: file.filename,
      hash: file.sha1,
      url: file.url.replace("blocked::", ""),
      projectId: mod.id,
    });
  }

  return blockedMods;
}

export function BlockedMods({
  onClose,
  mods,
}: {
  onClose: (mods: IBlockedMod[]) => void;
  mods: IBlockedMod[];
}) {
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>(mods);
  const [downloadsPath, setDownloadsPath] = useState<string>("");
  const [viewMode, setViewMode] = useState<"all" | "notInstalled">(
    "notInstalled",
  );

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const { t } = useTranslation();

  const checkDownloadedFiles = useCallback(
    async (downloadsPath: string) => {
      try {
        const files = await api.fs.readdir(downloadsPath);
        const blockedNames = new Set(blockedMods.map((mod) => mod.fileName));
        const updates: IBlockedMod[] = [];

        for (const file of files) {
          if (!blockedNames.has(file)) continue;

          const filePath = await api.path.join(downloadsPath, file);
          const blockedMod = blockedMods.find((mod) => mod.fileName === file);
          if (!blockedMod) continue;

          const hash = await api.fs.sha1(filePath);

          if (hash === blockedMod.hash && blockedMod.filePath !== filePath) {
            blockedMod.filePath = filePath;
            updates.push(blockedMod);
          }
        }

        for (const mod of blockedMods.filter((mod) => mod.filePath)) {
          if (!mod.filePath) continue;

          const isExists = await api.fs.pathExists(mod.filePath);
          if (!isExists && mod.filePath) {
            mod.filePath = undefined;
            updates.push(mod);
          }
        }

        if (updates.length > 0 && isMountedRef.current) {
          setBlockedMods((prev) => [...prev]);
        }
      } catch (error) {
        console.error("Error checking downloaded files:", error);
      }
    },
    [blockedMods],
  );

  useEffect(() => {
    isMountedRef.current = true;

    api.other.getPath("downloads").then((path: string) => {
      if (!isMountedRef.current) return;

      setDownloadsPath(path);

      intervalRef.current = setInterval(() => {
        checkDownloadedFiles(path);
      }, 1000);
    });

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkDownloadedFiles]);

  useEffect(() => {
    const notInstalledMods = blockedMods.filter((mod) => !mod.filePath);
    if (notInstalledMods.length === 0) {
      onClose(blockedMods);
    }
  }, [blockedMods, onClose]);

  const filteredMods = useMemo(() => {
    return blockedMods.filter((mod) => {
      if (viewMode === "all") return true;
      return !mod.filePath;
    });
  }, [blockedMods, viewMode]);

  const installedCount = useMemo(() => {
    return blockedMods.filter((mod) => !!mod.filePath).length;
  }, [blockedMods]);

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "all" ? "notInstalled" : "all"));
  }, []);

  const handleOpenAll = useCallback(async () => {
    const modsToOpen = blockedMods.filter((mod) => !mod.filePath);
    for (const mod of modsToOpen) {
      try {
        await api.shell.openExternal(mod.url);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error("Error opening URL:", error);
      }
    }
  }, [blockedMods]);

  const handleClose = useCallback(() => {
    onClose([]);
  }, [onClose]);

  return (
    <Modal
      isOpen={true}
      size="xl"
      isDismissable={false}
      isKeyboardDismissDisabled={true}
      onClose={handleClose}
    >
      <ModalContent>
        <ModalHeader>{t("blockedMods.title")}</ModalHeader>
        <ModalBody>
          <div className="flex flex-col space-y-2">
            <Alert color="warning" title={t("blockedMods.description")} />
            <div className="flex flex-col space-y-1">
              <div className="flex items-center space-x-2">
                <p>
                  {t("blockedMods.files")} ({blockedMods.length})
                </p>
                <Button
                  variant="flat"
                  size="sm"
                  isIconOnly
                  isDisabled={installedCount === 0}
                  color={viewMode === "notInstalled" ? "warning" : undefined}
                  onPress={handleToggleView}
                >
                  <Eye size={22} />
                </Button>
              </div>
              <div className="max-h-[215px] overflow-auto pr-1">
                {filteredMods.map((mod) => (
                  <Card
                    key={`${mod.projectId}-${mod.fileName}`}
                    className="mb-2 border-white/20 border-1"
                  >
                    <CardBody>
                      <div className="flex justify-between space-x-2 items-center">
                        <div className="flex flex-col">
                          <p
                            className={`text-sm font-semibold ${mod.filePath ? "text-success" : "text-warning"}`}
                          >
                            {mod.fileName}
                          </p>
                          <p className="text-xs text-gray-400">{mod.hash}</p>
                        </div>
                        {!mod.filePath && (
                          <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            className="text-xs"
                            onPress={async () => {
                              try {
                                await api.shell.openExternal(mod.url);
                              } catch (error) {
                                console.error("Error opening URL:", error);
                              }
                            }}
                          >
                            <ExternalLink size={20} />
                          </Button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
            <p className="text-primary-500 text-sm font-semibold">
              {t("blockedMods.watchedFolder")}: {downloadsPath}
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={handleOpenAll}>
            {t("blockedMods.openAll")}
          </Button>
          <Button variant="flat" color="danger" onPress={handleClose}>
            {t("common.close")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
