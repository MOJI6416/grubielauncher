import { IServer } from "@/types/ServersList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Globe2,
  PackageCheck,
  PackageMinus,
  PackageSearch,
  Plus,
  Server,
  Trash,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateServer } from "./CreateServer";
import { RunGameParams } from "@renderer/App";
import { toast } from "sonner";
import { Confirmation } from "../Modals/Confirmation";

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
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const ignoreNextOuterCloseRef = useRef(false);

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

  const preventOuterPortalInteraction = (event: {
    target: EventTarget | null;
    preventDefault: () => void;
  }) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (
      target.closest(
        '[data-slot="dropdown-menu-content"], [data-radix-popper-content-wrapper]',
      )
    ) {
      ignoreNextOuterCloseRef.current = true;
      event.preventDefault();
      return;
    }

    if (target.closest('[data-slot="select-content"]')) {
      ignoreNextOuterCloseRef.current = true;
      event.preventDefault();
    }
  };

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (open) return;

          if (ignoreNextOuterCloseRef.current) {
            ignoreNextOuterCloseRef.current = false;
            return;
          }

          closeModal();
        }}
      >
        <DialogContent aria-describedby={undefined}
          className="min-w-0 overflow-hidden p-0 sm:max-w-md"
          onPointerDownOutside={preventOuterPortalInteraction}
          onFocusOutside={preventOuterPortalInteraction}
          onInteractOutside={preventOuterPortalInteraction}
        >
          {isCreatingServer ? (
            <CreateServer
              onClose={() => setIsCreatingServer(false)}
              servers={servers}
              setQuickConnectIp={setQuickConnectIp}
              setServers={setServers}
            />
          ) : (
            <>
              <DialogHeader className="border-b py-4 pr-12 pl-5">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="flex items-center gap-2">
                    <Server className="size-5" />
                    {t("servers.title")}
                  </DialogTitle>
                  {!isDownloadedVersion && isOwnerVersion && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setIsCreatingServer(true);
                      }}
                    >
                      <Plus />
                      {t("servers.add")}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <TooltipProvider delayDuration={150}>
                <div className="min-w-0 max-w-full px-5 pb-4">
                  {servers.length == 0 ? (
                    <div className="flex min-h-56 w-full items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        {t("servers.noServers")}
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[22rem]">
                      <div className="grid gap-2 pr-3">
                        {servers.map((server, index) => {
                          const isEditing = editingIndex === index;

                          const disabledKeys = new Set(disabledGlobalKeys);
                          if (index === 0) disabledKeys.add("moveUp");
                          if (index === servers.length - 1)
                            disabledKeys.add("moveDown");

                          return (
                            <Card
                              key={server.ip || index}
                              className="gap-0 overflow-hidden py-0 shadow-none transition-colors hover:bg-accent/25"
                            >
                              <CardContent className="p-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                                    {server.icon ? (
                                      <img
                                        width={40}
                                        height={40}
                                        className="h-full w-full object-cover"
                                        src={`data:image/png;base64,${server.icon}`}
                                        alt={`${server.name} icon`}
                                      />
                                    ) : (
                                      <Globe2 className="size-5" />
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    {isEditing ? (
                                      <div className="grid gap-2">
                                        <Input
                                          value={editValue}
                                          onChange={(e) =>
                                            setEditValue(e.target.value)
                                          }
                                          className="h-9 min-w-0"
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
                                      </div>
                                    ) : (
                                      <div className="grid min-w-0 gap-1">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <span
                                            className="block min-w-0 truncate text-sm font-semibold text-foreground"
                                            title={server.name}
                                          >
                                            {server.name}
                                          </span>
                                          {quickConnectIp == server.ip && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="inline-flex shrink-0">
                                                  <Zap
                                                    size={16}
                                                    className="text-yellow-400"
                                                  />
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                {t("servers.quickConnect")}
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                        <span
                                          className="block min-w-0 truncate text-xs text-muted-foreground"
                                          title={server.ip}
                                        >
                                          {server.ip}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex">
                                          {isEditing ? (
                                            <Button
                                              variant="secondary"
                                              size="icon-sm"
                                              className="size-8"
                                              onClick={() => {
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
                                            <Badge
                                              variant="secondary"
                                              className="inline-flex size-8 cursor-default items-center justify-center rounded-md border border-border bg-card p-0 text-foreground shadow-sm"
                                            >
                                              {getTexturesIcon(
                                                server.acceptTextures,
                                              )}
                                            </Badge>
                                          )}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {isEditing
                                          ? `${t("common.edit")}: ${
                                              server.acceptTextures == null
                                                ? t("servers.resourceSets.0")
                                                : server.acceptTextures
                                                  ? t("servers.resourceSets.1")
                                                  : t("servers.resourceSets.2")
                                            }`
                                          : `${t("servers.resources")}: ${
                                              server.acceptTextures == null
                                                ? t("servers.resourceSets.0")
                                                : server.acceptTextures
                                                  ? t("servers.resourceSets.1")
                                                  : t("servers.resourceSets.2")
                                            }`}
                                      </TooltipContent>
                                    </Tooltip>

                                    {!isAdding && (
                                      <div className="flex items-center gap-1.5">
                                        {isEditing && (
                                          <>
                                            <Button
                                              size="icon-sm"
                                              disabled={
                                                editValue.trim() === "" ||
                                                editValue.trim().length > 64 ||
                                                editValue.trim() ===
                                                  server.name ||
                                                isDuplicateName
                                              }
                                              onClick={(event) => {
                                                event.stopPropagation();
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
                                              <Edit />
                                            </Button>

                                            <Button
                                              variant="destructive"
                                              size="icon-sm"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setEditingIndex(null);
                                                setEditValue("");
                                              }}
                                            >
                                              <X />
                                            </Button>
                                          </>
                                        )}

                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="icon-sm"
                                              className="size-8 bg-background/40 hover:bg-accent"
                                              disabled={editingIndex !== null}
                                            >
                                              <EllipsisVertical />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                              onSelect={() => {
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
                                              <Gamepad2 />
                                              <span>{t("nav.play")}</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              disabled={disabledKeys.has(
                                                "edit",
                                              )}
                                              onSelect={(event) => {
                                                event.stopPropagation();
                                                ignoreNextOuterCloseRef.current =
                                                  true;
                                                setEditingIndex(index);
                                                setEditValue(server.name);
                                              }}
                                            >
                                              <Edit />
                                              <span>{t("common.edit")}</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              onSelect={async () => {
                                                await api.clipboard.writeText(
                                                  server.ip,
                                                );
                                                toast(t("common.copied"));
                                              }}
                                            >
                                              <Copy />
                                              <span>
                                                {t("servers.copyAddress")}
                                              </span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              disabled={disabledKeys.has(
                                                "moveUp",
                                              )}
                                              onSelect={() => {
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
                                              <ChevronUp />
                                              <span>{t("servers.moveUp")}</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              disabled={disabledKeys.has(
                                                "moveDown",
                                              )}
                                              onSelect={() => {
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
                                              <ChevronDown />
                                              <span>
                                                {t("servers.moveDown")}
                                              </span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              disabled={disabledKeys.has(
                                                "quickConnect",
                                              )}
                                              onSelect={() => {
                                                setQuickConnectIp(
                                                  quickConnectIp === server.ip
                                                    ? ""
                                                    : server.ip,
                                                );
                                              }}
                                            >
                                              <Zap
                                                className={
                                                  quickConnectIp != server.ip
                                                    ? "text-yellow-400"
                                                    : undefined
                                                }
                                              />
                                              <span>
                                                {t("servers.quickConnect")}
                                              </span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              variant="destructive"
                                              disabled={disabledKeys.has(
                                                "delete",
                                              )}
                                              onSelect={() =>
                                                setDeleteIndex(index)
                                              }
                                            >
                                              <Trash />
                                              <span>{t("common.delete")}</span>
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </TooltipProvider>
            </>
          )}
        </DialogContent>
      </Dialog>

      {deleteIndex !== null && servers[deleteIndex] && (
        <Confirmation
          content={[
            {
              text: t("servers.confirmation", {
                name: servers[deleteIndex].name,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.yes"),
              color: "danger",
              onClick: () => {
                const idx = deleteIndex;
                setServers((prev) => prev.filter((_, i) => i !== idx));
                setDeleteIndex(null);
                toast.success(t("servers.deleted"));
              },
            },
            {
              text: t("common.no"),
              color: "default",
              onClick: () => setDeleteIndex(null),
            },
          ]}
          onClose={() => setDeleteIndex(null)}
        />
      )}
    </>
  );
}
