import { ILocalProject } from "@/types/ModManager";
import { IWorld } from "@/types/World";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ScrollShadow,
  Select,
  SelectItem,
  addToast,
} from "@heroui/react";
import { Folder, PackagePlus, Trash } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const api = window.api;

export function Datapacks({
  onClose,
  world,
  datapacks,
}: {
  onClose: () => void;
  world: IWorld;
  datapacks: { mod: ILocalProject; path: string; filename: string }[];
}) {
  const [datapackName, setDatapackName] = useState<string>("");
  const [worldDatapacks, setWorldDatapacks] = useState<string[]>(() => [
    ...world.datapacks,
  ]);

  const { t } = useTranslation();

  useEffect(() => {
    setWorldDatapacks([...world.datapacks]);
  }, [world]);

  const disabledKeys = useMemo(() => new Set(worldDatapacks), [worldDatapacks]);

  const isInstalled = useMemo(() => {
    return datapackName ? worldDatapacks.includes(datapackName) : false;
  }, [datapackName, worldDatapacks]);

  function DatapackItem({ fileName }: { fileName: string }) {
    const pack = datapacks.find((dp) => dp.filename === fileName);

    return (
      <Card className="border-white/20 border-1">
        <CardBody>
          <div className="flex items-center justify-between gap-4 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              {pack?.mod.iconUrl && (
                <Image
                  src={pack.mod.iconUrl}
                  width={32}
                  height={32}
                  className="min-h-8 min-w-8"
                />
              )}
              <p className="text-sm truncate min-w-0">
                {pack ? pack.mod.title : fileName}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="flat"
                color="danger"
                size="sm"
                isIconOnly
                onPress={async () => {
                  try {
                    const targetPath = await api.path.join(
                      world.path,
                      "datapacks",
                      fileName,
                    );
                    await api.fs.rimraf(targetPath);

                    setWorldDatapacks((prev) =>
                      prev.filter((dp) => dp !== fileName),
                    );
                    world.datapacks = world.datapacks.filter(
                      (dp) => dp !== fileName,
                    );
                  } catch (err) {
                    console.error(err);
                    addToast({
                      title: t("common.error") || "Error",
                      color: "danger",
                    });
                  }
                }}
              >
                <Trash size={20} />
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Modal isOpen onClose={() => onClose()}>
      <ModalContent>
        <ModalHeader>{t("worlds.datapacks")}</ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Select
                isDisabled={!datapacks.length}
                selectedKeys={
                  datapackName ? new Set([datapackName]) : new Set()
                }
                onChange={(e) => setDatapackName(e.target.value || "")}
                disabledKeys={disabledKeys}
              >
                {datapacks.map((dp) => (
                  <SelectItem key={dp.filename}>{dp.mod.title}</SelectItem>
                ))}
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  isDisabled={!datapackName || isInstalled}
                  variant="flat"
                  color="primary"
                  isIconOnly
                  onPress={async () => {
                    if (!datapackName || isInstalled) return;

                    const datapack = datapacks.find(
                      (dp) => dp.filename === datapackName,
                    );
                    if (!datapack) return;

                    const targetPath = await api.path.join(
                      world.path,
                      "datapacks",
                      datapackName,
                    );

                    try {
                      await api.fs.copy(datapack.path, targetPath);

                      setWorldDatapacks((prev) => {
                        if (prev.includes(datapackName)) return prev;
                        return [...prev, datapackName];
                      });

                      if (!world.datapacks.includes(datapackName)) {
                        world.datapacks.push(datapackName);
                      }
                    } catch (err) {
                      console.error(err);
                      addToast({
                        title: t("common.error") || "Error",
                        color: "danger",
                      });
                    }

                    setDatapackName("");
                  }}
                >
                  <PackagePlus size={22} />
                </Button>

                <Button
                  variant="flat"
                  isIconOnly
                  onPress={async () => {
                    try {
                      await api.shell.openPath(
                        await api.path.join(world.path, "datapacks"),
                      );
                    } catch (err) {
                      console.error(err);
                      addToast({
                        title: t("common.error") || "Error",
                        color: "danger",
                      });
                    }
                  }}
                >
                  <Folder size={22} />
                </Button>
              </div>
            </div>

            {worldDatapacks.length > 0 ? (
              <ScrollShadow className="max-h-64">
                <div className="flex flex-col gap-2">
                  {worldDatapacks.map((d) => (
                    <DatapackItem fileName={d} key={d} />
                  ))}
                </div>
              </ScrollShadow>
            ) : (
              <Alert title={t("worlds.noDatapacks")} />
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
