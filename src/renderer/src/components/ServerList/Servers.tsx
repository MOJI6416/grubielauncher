import { IServer } from "@/types/ServersList";
import {
  addToast,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Tooltip,
  Image,
  Alert,
  Card,
  CardBody,
  ScrollShadow,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import {
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Edit,
  EllipsisVertical,
  Gamepad2,
  PackageCheck,
  PackageMinus,
  PackageSearch,
  Plus,
  Trash,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateServer } from "./CreateServer";
import { RunGameParams } from "@renderer/App";

const api = window.api;

export function Servers({
  servers,
  setServers,
  closeModal,
  quickConnectIp,
  setQuickConnectIp,
  runGame,
  isAdding,
}: {
  servers: IServer[];
  setServers: React.Dispatch<React.SetStateAction<IServer[]>>;
  quickConnectIp: string | undefined;
  setQuickConnectIp: (ip: string) => void;
  closeModal: (isFull?: boolean) => void;
  runGame?: (params: RunGameParams) => Promise<void>;
  isAdding?: boolean;
}) {
  const { t } = useTranslation();
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const canManage = !isDownloadedVersion && isOwnerVersion && !isAdding;

  const disabledGlobalKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!canManage) {
      keys.add("edit");
      keys.add("moveUp");
      keys.add("moveDown");
      keys.add("quickConnect");
      keys.add("delete");
    }
    return keys;
  }, [canManage]);

  const isDuplicateName = useMemo(() => {
    if (editingIndex === null) return false;
    const nextName = editValue.trim().toLowerCase();
    if (!nextName) return false;
    return servers.some(
      (s, i) => i !== editingIndex && s.name.trim().toLowerCase() === nextName,
    );
  }, [servers, editingIndex, editValue]);

  const cycleTextures = (value: number | null) => {
    if (value === null) return 1;
    if (value === 1) return 0;
    return null;
  };

  const getTexturesIcon = (value: number | null) => {
    if (value === null) return <PackageSearch size={20} />;
    if (value) return <PackageCheck size={20} />;
    return <PackageMinus size={20} />;
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          closeModal();
        }}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              {t("servers.title")}
              {!isDownloadedVersion && isOwnerVersion && (
                <div>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    isIconOnly
                    onPress={() => {
                      setIsCreatingServer(true);
                    }}
                  >
                    <Plus size={20} />
                  </Button>
                </div>
              )}
            </div>
          </ModalHeader>

          <ModalBody>
            <div className="max-h-96 w-full">
              {servers.length == 0 ? (
                <div className="flex w-full items-center">
                  <Alert variant="flat" title={t("servers.noServers")} />
                </div>
              ) : (
                <ScrollShadow className="h-80">
                  <div className="flex flex-col gap-2 pr-1">
                    {servers.map((server, index) => {
                      const isEditing = editingIndex === index;

                      const disabledKeys = new Set(disabledGlobalKeys);
                      if (index === 0) disabledKeys.add("moveUp");
                      if (index === servers.length - 1)
                        disabledKeys.add("moveDown");

                      return (
                        <Card
                          key={server.ip || index}
                          className="border-white/20 border-1"
                        >
                          <CardBody>
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                {server.icon && (
                                  <Image
                                    width={40}
                                    height={40}
                                    className="min-h-10 min-w-10 shrink-0"
                                    src={`data:image/png;base64,${server.icon}`}
                                  />
                                )}

                                {isEditing ? (
                                  <Input
                                    value={editValue}
                                    onChange={(e) =>
                                      setEditValue(e.target.value)
                                    }
                                    size="sm"
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        setEditingIndex(null);
                                        setEditValue("");
                                      }
                                      if (e.key === "Enter") {
                                        const next = editValue.trim();
                                        if (!next) return;
                                        if (next.length > 64) return;
                                        if (isDuplicateName) return;
                                        if (next === server.name) return;

                                        setServers((prev) => {
                                          const copy = [...prev];
                                          copy[index] = {
                                            ...copy[index],
                                            name: next,
                                          };
                                          return copy;
                                        });

                                        setEditingIndex(null);
                                        setEditValue("");
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm font-semibold truncate">
                                        {server.name}
                                      </span>
                                      {quickConnectIp == server.ip && (
                                        <Tooltip
                                          content={t("servers.quickConnect")}
                                          delay={500}
                                        >
                                          <Zap
                                            size={16}
                                            color="yellow"
                                            className="shrink-0"
                                          />
                                        </Tooltip>
                                      )}
                                    </div>
                                    <span className="text-xs text-gray-400 truncate">
                                      {server.ip}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <Tooltip
                                  delay={500}
                                  size="sm"
                                  content={`${t("servers.resources")}: ${
                                    server.acceptTextures == null
                                      ? t("servers.resourceSets.0")
                                      : server.acceptTextures
                                        ? t("servers.resourceSets.1")
                                        : t("servers.resourceSets.2")
                                  }`}
                                >
                                  {isEditing ? (
                                    <Button
                                      variant="flat"
                                      size="sm"
                                      isIconOnly
                                      onPress={() => {
                                        const nextValue = cycleTextures(
                                          server.acceptTextures,
                                        );

                                        setServers((prev) => {
                                          const copy = [...prev];
                                          copy[index] = {
                                            ...copy[index],
                                            acceptTextures: nextValue,
                                          };
                                          return copy;
                                        });
                                      }}
                                    >
                                      {getTexturesIcon(
                                        server.acceptTextures,
                                      )}{" "}
                                    </Button>
                                  ) : (
                                    getTexturesIcon(server.acceptTextures)
                                  )}
                                </Tooltip>

                                {!isAdding && (
                                  <div className="flex items-center gap-1">
                                    {isEditing && (
                                      <>
                                        <Button
                                          variant="flat"
                                          size="sm"
                                          color="success"
                                          isIconOnly
                                          isDisabled={
                                            editValue.trim() === "" ||
                                            editValue.trim().length > 64 ||
                                            editValue.trim() === server.name ||
                                            isDuplicateName
                                          }
                                          onPress={() => {
                                            const next = editValue.trim();
                                            if (!next) return;
                                            if (next.length > 64) return;
                                            if (isDuplicateName) return;

                                            setServers((prev) => {
                                              const copy = [...prev];
                                              copy[index] = {
                                                ...copy[index],
                                                name: next,
                                              };
                                              return copy;
                                            });

                                            setEditingIndex(null);
                                            setEditValue("");
                                          }}
                                        >
                                          <Edit size={20} />
                                        </Button>

                                        <Button
                                          variant="flat"
                                          color="danger"
                                          size="sm"
                                          isIconOnly
                                          onPress={() => {
                                            setEditingIndex(null);
                                            setEditValue("");
                                          }}
                                        >
                                          <X size={20} />
                                        </Button>
                                      </>
                                    )}

                                    <Dropdown
                                      isTriggerDisabled={editingIndex !== null}
                                      size="sm"
                                    >
                                      <DropdownTrigger>
                                        <Button
                                          isIconOnly
                                          variant="flat"
                                          size="sm"
                                        >
                                          <EllipsisVertical size={22} />
                                        </Button>
                                      </DropdownTrigger>
                                      <DropdownMenu
                                        disabledKeys={[...disabledKeys]}
                                      >
                                        <DropdownItem
                                          key="play"
                                          color="secondary"
                                          className="text-secondary"
                                          startContent={
                                            <Gamepad2
                                              className="shrink-0"
                                              size={20}
                                            />
                                          }
                                          onPress={() => {
                                            if (!runGame) return;

                                            runGame({
                                              version: selectedVersion,
                                              quick: {
                                                multiplayer: server.ip,
                                              },
                                            });
                                            closeModal();
                                          }}
                                        >
                                          {t("nav.play")}
                                        </DropdownItem>
                                        <DropdownItem
                                          key="edit"
                                          variant="flat"
                                          startContent={<Edit size={20} />}
                                          onPress={() => {
                                            setEditingIndex(index);
                                            setEditValue(server.name);
                                          }}
                                        >
                                          {t("common.edit")}
                                        </DropdownItem>
                                        <DropdownItem
                                          key="copyAdress"
                                          variant="flat"
                                          startContent={<Copy size={20} />}
                                          onPress={async () => {
                                            await api.clipboard.writeText(
                                              server.ip,
                                            );
                                            addToast({
                                              title: t("common.copied"),
                                            });
                                          }}
                                        >
                                          {t("servers.copyAddress")}
                                        </DropdownItem>
                                        <DropdownItem
                                          key="moveUp"
                                          variant="flat"
                                          startContent={<ChevronUp size={20} />}
                                          onPress={() => {
                                            setServers((prev) => {
                                              if (index <= 0) return prev;
                                              const copy = [...prev];
                                              const temp = copy[index - 1];
                                              copy[index - 1] = copy[index];
                                              copy[index] = temp;
                                              return copy;
                                            });
                                          }}
                                        >
                                          {t("servers.moveUp")}
                                        </DropdownItem>
                                        <DropdownItem
                                          key="moveDown"
                                          variant="flat"
                                          startContent={
                                            <ChevronDown size={20} />
                                          }
                                          onPress={() => {
                                            setServers((prev) => {
                                              if (index >= prev.length - 1)
                                                return prev;
                                              const copy = [...prev];
                                              const temp = copy[index + 1];
                                              copy[index + 1] = copy[index];
                                              copy[index] = temp;
                                              return copy;
                                            });
                                          }}
                                        >
                                          {t("servers.moveDown")}
                                        </DropdownItem>
                                        <DropdownItem
                                          key="quickConnect"
                                          variant="flat"
                                          startContent={
                                            <Zap
                                              color={
                                                quickConnectIp != server.ip
                                                  ? "yellow"
                                                  : "white"
                                              }
                                              size={20}
                                            />
                                          }
                                          onPress={() => {
                                            setQuickConnectIp(
                                              quickConnectIp === server.ip
                                                ? ""
                                                : server.ip,
                                            );
                                          }}
                                        >
                                          {t("servers.quickConnect")}
                                        </DropdownItem>
                                        <DropdownItem
                                          key="delete"
                                          className="text-danger"
                                          variant="flat"
                                          color="danger"
                                          startContent={<Trash size={20} />}
                                          onPress={() => {
                                            setServers((prev) =>
                                              prev.filter(
                                                (_, i) => i !== index,
                                              ),
                                            );

                                            addToast({
                                              title: t("servers.deleted"),
                                              color: "success",
                                            });
                                          }}
                                        >
                                          {t("common.delete")}
                                        </DropdownItem>
                                      </DropdownMenu>
                                    </Dropdown>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollShadow>
              )}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {isCreatingServer && (
        <CreateServer
          onClose={() => setIsCreatingServer(false)}
          servers={servers}
          setQuickConnectIp={setQuickConnectIp}
          setServers={setServers}
        />
      )}
    </>
  );
}
