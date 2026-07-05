import { ICatalogSkin, ISkinEntry, SkinsData } from "@/types/SkinManager";
import {
  accountAtom,
  authDataAtom,
  internetAtom,
  networkAtom,
  pathsAtom,
  pendingSkinDeepLinkAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import {
  Check,
  FileImage,
  FilePlus2,
  Image as ImageIcon,
  Globe,
  Link,
  Loader2,
  Mars,
  Shirt,
  Sparkles,
  Trash,
  Upload,
  User,
  Venus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useCallback, memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import SkinCanvas from "./SkinCanvas";
import { SkinCatalog } from "./SkinCatalog";
import { TagsInput } from "./TagsInput";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { canOpenSkinManagerForAccount } from "@renderer/utilities/connectivity";
import { toFileUrl } from "@renderer/utilities/exportVersion";

const api = window.api;
const NO_CAPE_VALUE = "__none";

const ScrollingText = memo(({ text }: { text: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const textWidth = textRef.current?.scrollWidth ?? 0;
      setIsOverflowing(textWidth > containerWidth);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    window.addEventListener("resize", checkOverflow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", checkOverflow);
    };
  }, [text]);

  return (
    <div ref={containerRef} className="skin-marquee">
      {isOverflowing ? (
        <div className="skin-marquee__track">
          <span ref={textRef} className="skin-marquee__item">
            {text}
          </span>
          <span className="skin-marquee__item" aria-hidden="true">
            {text}
          </span>
        </div>
      ) : (
        <span ref={textRef} className="skin-marquee__single">
          {text}
        </span>
      )}
    </div>
  );
});

ScrollingText.displayName = "ScrollingText";

const SkinCard = memo(
  ({
    skin,
    isSelected,
    isActive,
    isLoading,
    actionLoading,
    onSelectSkin,
    onRenameSkin,
    onDeleteSkin,
    isRenameDisabled,
    isDeleteDisabled,
    renameLabel,
    deleteLabel,
  }: {
    skin: ISkinEntry;
    isSelected: boolean;
    isActive: boolean;
    isLoading: boolean;
    actionLoading: string | null;
    onSelectSkin: (id: string) => void;
    onRenameSkin: (id: string) => void;
    onDeleteSkin: (id: string) => void;
    isRenameDisabled: boolean;
    isDeleteDisabled: boolean;
    renameLabel: string;
    deleteLabel: string;
  }) => {
    const handlePress = useCallback(() => {
      onSelectSkin(skin.id);
    }, [onSelectSkin, skin.id]);

    return (
      <ContextMenu>
        <ContextMenuTrigger
          asChild
          disabled={isLoading || actionLoading !== null}
        >
          <div data-skin-card="true">
            <Card
              data-skin-card="true"
              role="button"
              tabIndex={isLoading || actionLoading !== null ? -1 : 0}
              aria-disabled={isLoading || actionLoading !== null}
              onClick={() => {
                if (isLoading || actionLoading !== null) return;
                handlePress();
              }}
              onKeyDown={(event) => {
                if (isLoading || actionLoading !== null) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                handlePress();
              }}
              className={cn(
                "relative w-full cursor-pointer gap-0 overflow-hidden border bg-card py-0 transition-all focus-visible:ring-2 focus-visible:ring-ring/50",
                isSelected &&
                  "border-primary bg-primary/10 ring-2 ring-primary/60",
                !isSelected &&
                  isActive &&
                  "border-[var(--success)] ring-2 ring-[var(--success)]",
                !isSelected && !isActive && "border-border",
                !isLoading &&
                  actionLoading === null &&
                  "hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/35 hover:shadow-sm",
                (isLoading || actionLoading !== null) &&
                  "cursor-not-allowed opacity-60",
              )}
            >
              {isSelected && (
                <span className="absolute top-2 left-2 z-10 flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                  <Check className="size-3" />
                </span>
              )}
              {isActive && (
                <span className="absolute top-2 right-2 z-10 size-2.5 rounded-full bg-[var(--success)] ring-2 ring-background" />
              )}
              <CardContent className="p-3">
                <div className="flex flex-col items-center gap-2 overflow-hidden">
                  <img
                    src={skin.character || skin.url}
                    width={64}
                    height={128}
                    loading="lazy"
                    alt={skin.name}
                    className="h-28 w-14 object-contain"
                  />
                  <div className="w-full text-xs">
                    <ScrollingText text={skin.name} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={isRenameDisabled}
            onSelect={() => onRenameSkin(skin.id)}
          >
            {renameLabel}
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            disabled={isDeleteDisabled}
            onSelect={() => onDeleteSkin(skin.id)}
          >
            {deleteLabel}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

SkinCard.displayName = "SkinCard";

export function ManageSkins({ onClose }: { onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"mine" | "catalog">("mine");
  const [actionLoading, setActionLoading] = useState<
    | "apply"
    | "byFile"
    | "reset"
    | "regenerate"
    | "byLink"
    | "byPlayer"
    | "publish"
    | null
  >(null);
  const [skinsData, setSkinsData] = useState<SkinsData | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [skinType, setSkinType] = useState<"skin" | "cape">("skin");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addSource, setAddSource] = useState<"file" | "link" | "nick">("file");
  const [pickedFile, setPickedFile] = useState<{
    path: string;
    name: string;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [debouncedInput, setDebouncedInput] = useState("");
  const dragCounterRef = useRef(0);
  const [renameDialogSkinId, setRenameDialogSkinId] = useState<string | null>(
    null,
  );
  const [publishDialogSkinId, setPublishDialogSkinId] = useState<string | null>(
    null,
  );
  const [publishName, setPublishName] = useState("");
  const [publishType, setPublishType] = useState<"skin" | "cape" | "pack">(
    "skin",
  );
  const [publishTags, setPublishTags] = useState<string[]>([]);
  const [deepLinkSkinId, setDeepLinkSkinId] = useState<string | null>(null);

  const [paths] = useAtom(pathsAtom);
  const [selectedAccount] = useAtom(accountAtom);
  const [authData] = useAtom(authDataAtom);
  const [isInternetOnline] = useAtom(internetAtom);
  const [isBackendOnline] = useAtom(networkAtom);
  const [pendingSkinDeepLink, setPendingSkinDeepLink] = useAtom(
    pendingSkinDeepLinkAtom,
  );

  useEffect(() => {
    if (!pendingSkinDeepLink) return;
    setDeepLinkSkinId(pendingSkinDeepLink);
    setView("catalog");
    setPendingSkinDeepLink(null);
  }, [pendingSkinDeepLink, setPendingSkinDeepLink]);

  const { t } = useTranslation();
  const isMicrosoftAccount = selectedAccount?.type === "microsoft";
  const isRemoteSkinServiceAvailable = canOpenSkinManagerForAccount(
    selectedAccount?.type,
    { isInternetOnline, isBackendOnline },
  );

  useEffect(() => {
    if (!selectedAccount) return;
    if (selectedAccount.type !== "discord" && selectedAccount.type !== "microsoft") {
      return;
    }
    if (!isBackendOnline) onClose();
  }, [isBackendOnline, onClose, selectedAccount]);

  useEffect(() => {
    const loadSkins = async () => {
      if (!selectedAccount || !authData) return;

      setIsLoading(true);
      try {
        const accessToken =
          selectedAccount.type === "microsoft"
            ? authData.auth.accessToken || ""
            : selectedAccount.accessToken || "";

        const data = await api.skins.load(
          paths.launcher,
          selectedAccount.type as "microsoft" | "discord",
          authData.uuid || "",
          selectedAccount.nickname || "",
          accessToken,
        );
        setSkinsData(data);
      } catch {
      } finally {
        setIsLoading(false);
      }
    };

    loadSkins();
  }, [selectedAccount, authData, paths.launcher]);

  const selectedCape = useMemo(() => {
    if (!skinsData) return null;
    return skinsData.capes.find(
      (c) =>
        c.id ===
        skinsData.skins.skins.find((s) => s.id === skinsData.selectedSkin)
          ?.capeId,
    );
  }, [skinsData]);

  const selectedSkinEntry = useMemo(() => {
    if (!skinsData) return null;
    return skinsData.skins.skins.find((s) => s.id === skinsData.selectedSkin);
  }, [skinsData]);

  const playerSkinUrl = useMemo(() => {
    if (!skinsData) return undefined;
    return skinsData.skins.skins.find((s) => s.id === skinsData.activeSkin)?.url;
  }, [skinsData]);

  useEffect(() => {
    setRenameValue(selectedSkinEntry?.name ?? "");
  }, [selectedSkinEntry?.id, selectedSkinEntry?.name]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedInput(inputValue.trim()), 400);
    return () => clearTimeout(id);
  }, [inputValue]);

  const renameDialogSkin = useMemo(() => {
    if (!skinsData || !renameDialogSkinId) return null;
    return (
      skinsData.skins.skins.find((skin) => skin.id === renameDialogSkinId) ??
      null
    );
  }, [renameDialogSkinId, skinsData]);

  const publishDialogSkin = useMemo(() => {
    if (!skinsData || !publishDialogSkinId) return null;
    return (
      skinsData.skins.skins.find((skin) => skin.id === publishDialogSkinId) ??
      null
    );
  }, [publishDialogSkinId, skinsData]);

  const publishDialogCape = useMemo(() => {
    if (!skinsData || !publishDialogSkin?.capeId) return null;
    return (
      skinsData.capes.find((cape) => cape.id === publishDialogSkin.capeId) ??
      null
    );
  }, [skinsData, publishDialogSkin]);

  const refreshSkins = useCallback(async () => {
    if (!selectedAccount || !authData) return;
    const accessToken =
      selectedAccount.type === "microsoft"
        ? authData.auth.accessToken || ""
        : selectedAccount.accessToken || "";

    const data = await api.skins.load(
      paths.launcher,
      selectedAccount.type as "microsoft" | "discord",
      authData.uuid || "",
      selectedAccount.nickname || "",
      accessToken,
    );
    setSkinsData(data);
  }, [selectedAccount, authData, paths.launcher]);

  const handleSelectSkin = useCallback(
    async (skinId: string) => {
      if (!authData || !selectedAccount) return;
      await api.skins.selectSkin(authData.uuid, selectedAccount.type, skinId);
      await refreshSkins();
    },
    [authData, selectedAccount, refreshSkins],
  );

  const handleImportFromCatalog = useCallback(
    async (skin: ICatalogSkin) => {
      if (!authData || !selectedAccount) return;
      try {
        if (skin.type === "cape") {
          if (!skin.capeUrl) return;
          await api.skins.importByUrl(
            authData.uuid,
            selectedAccount.type,
            skin.capeUrl,
            "cape",
          );
        } else if (skin.type === "pack") {
          if (!skin.skinUrl || !skin.capeUrl) return;
          await api.skins.importPack(
            authData.uuid,
            selectedAccount.type,
            skin.skinUrl,
            skin.capeUrl,
          );
        } else {
          if (!skin.skinUrl) return;
          await api.skins.importByUrl(
            authData.uuid,
            selectedAccount.type,
            skin.skinUrl,
            "skin",
          );
        }
        void api.skins.catalog.download(skin.id).catch(() => undefined);
        await refreshSkins();
        setView("mine");
        toast.success(t("manageSkins.catalogImported"));
      } catch {
        toast.error(t("manageSkins.importError"));
      }
    },
    [authData, selectedAccount, refreshSkins, t],
  );

  const handleSetCape = useCallback(
    async (capeId: string | undefined) => {
      if (!authData || !selectedAccount) return;
      try {
        const data = await api.skins.setCape(
          authData.uuid,
          selectedAccount.type,
          capeId,
        );
        if (!data) throw new Error("Failed to set cape");
        setSkinsData(data);
      } catch {
        toast.error(t("manageSkins.applyError"));
        await refreshSkins().catch(() => undefined);
      }
    },
    [authData, selectedAccount, refreshSkins, t],
  );

  const handleChangeModel = useCallback(
    async (model?: "classic" | "slim") => {
      if (!authData || !selectedAccount || !selectedSkinEntry) return;
      const newModel =
        model ?? (selectedSkinEntry.model === "classic" ? "slim" : "classic");
      if (newModel === selectedSkinEntry.model) return;

      await api.skins.changeModel(
        authData.uuid,
        selectedAccount.type,
        newModel,
      );
      await refreshSkins();
    },
    [authData, selectedAccount, selectedSkinEntry, refreshSkins],
  );

  const handleApply = useCallback(async () => {
    if (!authData || !selectedAccount || !selectedSkinEntry) return;
    if (!isRemoteSkinServiceAvailable) return;
    setActionLoading("apply");
    try {
      const data = await api.skins.uploadSkin(
        authData.uuid,
        selectedAccount.type,
        selectedSkinEntry.id,
      );
      if (!data) throw new Error("Failed to apply skin");
      setSkinsData(data);
      await refreshSkins();
    } catch {
      toast.error(t("manageSkins.applyError"));
      await refreshSkins().catch(() => undefined);
    } finally {
      setActionLoading(null);
    }
  }, [
    authData,
    selectedAccount,
    selectedSkinEntry,
    isRemoteSkinServiceAvailable,
    refreshSkins,
    t,
  ]);

  const handleDeleteSkin = useCallback(
    async (skinId: string, type: "skin" | "cape") => {
      if (!authData || !selectedAccount) return;
      await api.skins.deleteSkin(
        authData.uuid,
        selectedAccount.type,
        skinId,
        type,
      );
      await refreshSkins();
    },
    [authData, selectedAccount, refreshSkins],
  );

  const handleReset = useCallback(async () => {
    if (!authData || !selectedAccount) return;
    if (!isRemoteSkinServiceAvailable) return;
    setActionLoading("reset");
    try {
      const data = await api.skins.resetSkin(authData.uuid, selectedAccount.type);
      if (!data) throw new Error("Failed to reset skin");
      setSkinsData(data);
      await refreshSkins();
    } catch {
      toast.error(t("manageSkins.applyError"));
      await refreshSkins().catch(() => undefined);
    } finally {
      setActionLoading(null);
    }
  }, [authData, selectedAccount, isRemoteSkinServiceAvailable, refreshSkins, t]);

  const handleRegenerate = useCallback(async () => {
    if (!authData || !selectedAccount) return;
    if (!isRemoteSkinServiceAvailable) return;
    setActionLoading("regenerate");
    try {
      const data = await api.skins.regenerateSkin(
        authData.uuid,
        selectedAccount.type,
      );
      if (!data) throw new Error("Failed to regenerate skin");
      setSkinsData(data);
      await refreshSkins();
    } catch {
      toast.error(t("manageSkins.applyError"));
      await refreshSkins().catch(() => undefined);
    } finally {
      setActionLoading(null);
    }
  }, [authData, selectedAccount, isRemoteSkinServiceAvailable, refreshSkins, t]);

  const closeAddDialog = useCallback(() => {
    setIsAddDialogOpen(false);
    setInputValue("");
    setPickedFile(null);
    setAddSource("file");
  }, []);

  const handlePickFile = useCallback(async () => {
    const filePaths = await api.other.openFileDialog(false, [
      { name: "Skins", extensions: ["png"] },
    ]);
    if (!filePaths?.length) return;
    const filePath = filePaths[0];
    setPickedFile({
      path: filePath,
      name: filePath.split(/[\\/]/).pop() || filePath,
    });
  }, []);

  const handleDropFile = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.name.toLowerCase().endsWith(".png"),
    );
    if (!file) return;
    const filePath = api.other.getPathForFile(file);
    if (!filePath) return;
    setPickedFile({ path: filePath, name: file.name });
  }, []);

  const handleImport = useCallback(async () => {
    if (!authData || !selectedAccount) return;

    if (addSource === "file") {
      if (!pickedFile) return;
      setActionLoading("byFile");
      try {
        await api.skins.importByFile(
          authData.uuid,
          selectedAccount.type,
          pickedFile.path,
          skinType,
        );
        await refreshSkins();
        closeAddDialog();
      } catch {
        toast.error(t("manageSkins.importError"));
      } finally {
        setActionLoading(null);
      }
      return;
    }

    const value = inputValue.trim();
    if (!value || !isInternetOnline) return;

    if (addSource === "nick") {
      setActionLoading("byPlayer");
      try {
        await api.skins.importByNickname(
          authData.uuid,
          selectedAccount.type,
          value,
        );
        await refreshSkins();
        closeAddDialog();
      } catch {
        toast.error(t("manageSkins.importError"));
      } finally {
        setActionLoading(null);
      }
      return;
    }

    setActionLoading("byLink");
    try {
      await api.skins.importByUrl(
        authData.uuid,
        selectedAccount.type,
        value,
        skinType,
      );
      await refreshSkins();
      closeAddDialog();
    } catch {
      toast.error(t("manageSkins.importError"));
    } finally {
      setActionLoading(null);
    }
  }, [
    authData,
    selectedAccount,
    addSource,
    pickedFile,
    skinType,
    inputValue,
    isInternetOnline,
    refreshSkins,
    closeAddDialog,
    t,
  ]);

  const handleRename = useCallback(
    async (skinId: string, value = inputValue) => {
      const nextName = value.trim();
      if (!authData || !selectedAccount || !nextName) return;
      await api.skins.renameSkin(
        authData.uuid,
        selectedAccount?.type,
        skinId,
        nextName,
      );
      await refreshSkins();
      setInputValue("");
      setRenameValue(nextName);
    },
    [authData, selectedAccount, inputValue, refreshSkins],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  const handleOpenRenameDialog = useCallback(
    (skinId: string) => {
      const skin = skinsData?.skins.skins.find((item) => item.id === skinId);
      if (!skin) return;
      setRenameValue(skin.name);
      setRenameDialogSkinId(skinId);
    },
    [skinsData],
  );

  const handleSubmitRename = useCallback(async () => {
    if (!renameDialogSkin) return;
    await handleRename(renameDialogSkin.id, renameValue);
    setRenameDialogSkinId(null);
  }, [handleRename, renameDialogSkin, renameValue]);

  const handleOpenPublishDialog = useCallback(
    (skinId: string) => {
      const skin = skinsData?.skins.skins.find((item) => item.id === skinId);
      if (!skin) return;
      setPublishName(skin.name);
      setPublishType("skin");
      setPublishTags([]);
      setPublishDialogSkinId(skinId);
    },
    [skinsData],
  );

  const handlePublish = useCallback(async () => {
    if (!authData || !selectedAccount || !publishDialogSkinId) return;
    if (!selectedAccount.accessToken) return;
    const name = publishName.trim();
    setActionLoading("publish");
    try {
      const result = await api.skins.publishCommunity(
        authData.uuid,
        selectedAccount.type,
        publishDialogSkinId,
        selectedAccount.accessToken,
        name || undefined,
        publishType,
        publishTags.join(","),
      );
      if (result.ok) {
        toast.success(t("manageSkins.publishPending"));
        setPublishDialogSkinId(null);
      } else if (result.error === "duplicate") {
        if (result.dupStatus === "rejected") {
          toast.error(
            result.reason
              ? t("manageSkins.publishRejected", { reason: result.reason })
              : t("manageSkins.publishRejectedNoReason"),
          );
        } else {
          toast.error(t("manageSkins.publishDuplicate"));
        }
      } else if (result.error === "limit") {
        toast.error(t("manageSkins.publishLimit"));
      } else {
        toast.error(t("manageSkins.publishError"));
      }
    } finally {
      setActionLoading(null);
    }
  }, [
    authData,
    selectedAccount,
    publishDialogSkinId,
    publishName,
    publishType,
    publishTags,
    t,
  ]);

  const isSkinRenameDisabled = useCallback(
    () => actionLoading !== null,
    [actionLoading],
  );

  const isRenameSubmitDisabled = useMemo(() => {
    const nextName = renameValue.trim();
    if (!renameDialogSkin || !nextName || actionLoading !== null) return true;
    if (nextName === renameDialogSkin.name) return true;
    return (
      skinsData?.skins.skins.some(
        (item) => item.name === nextName && item.id !== renameDialogSkin.id,
      ) ?? true
    );
  }, [actionLoading, renameDialogSkin, renameValue, skinsData]);

  const isSkinDeleteDisabled = useCallback(
    (skin: ISkinEntry) => skin.id === skinsData?.activeSkin,
    [skinsData],
  );

  const addPreviewUrl = useMemo(() => {
    if (addSource === "file")
      return pickedFile ? toFileUrl(pickedFile.path) : null;
    if (addSource === "link") return debouncedInput || null;
    return null;
  }, [addSource, pickedFile, debouncedInput]);

  const isImportDisabled = useMemo(() => {
    if (actionLoading !== null) return true;
    if (addSource === "file") return !pickedFile;
    if (!inputValue.trim()) return true;
    return !isInternetOnline;
  }, [actionLoading, addSource, pickedFile, inputValue, isInternetOnline]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading && !actionLoading) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        data-account-click-ignore="true"
        className="max-h-[calc(100vh-2rem)] overflow-hidden sm:max-w-[1030px]"
        onPointerDownOutside={(event) => {
          if (
            isLoading ||
            actionLoading ||
            isAddDialogOpen ||
            renameDialogSkinId ||
            publishDialogSkinId
          ) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (
            isLoading ||
            actionLoading ||
            isAddDialogOpen ||
            renameDialogSkinId ||
            publishDialogSkinId
          ) {
            event.preventDefault();
          }
        }}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Shirt className="size-5" />
              {t("manageSkins.title")}
            </DialogTitle>
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as "mine" | "catalog")}
            >
              <TabsList>
                <TabsTrigger value="mine">
                  {t("manageSkins.tabMine")}
                </TabsTrigger>
                <TabsTrigger value="catalog">
                  {t("manageSkins.tabCatalog")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        <div className="h-[500px] max-h-[calc(100vh-9rem)] min-h-0">
          {view === "catalog" ? (
            <SkinCatalog
              onImport={handleImportFromCatalog}
              isOnline={isInternetOnline}
              disabled={actionLoading !== null}
              backendToken={selectedAccount?.accessToken}
              initialSkinId={deepLinkSkinId}
              playerSkinUrl={playerSkinUrl}
            />
          ) : isLoading ||
            !skinsData ||
            !selectedAccount ||
            !selectedAccount?.accessToken ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_340px_290px]">
              <div className="flex min-h-0 min-w-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {t("manageSkins.skins")}
                    </p>
                    <Badge variant="secondary" className="tabular-nums">
                      {skinsData.skins.skins.length}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsAddDialogOpen(true)}
                    disabled={actionLoading !== null}
                  >
                    <FilePlus2 className="size-4" />
                    {t("common.add")}
                  </Button>
                </div>
                <ScrollArea className="h-full min-h-0 flex-1 rounded-xl border bg-card">
                  <div className="grid grid-cols-3 gap-2 p-3">
                    {skinsData.skins.skins.map((skin) => {
                      const isSelected = skin.id === skinsData.selectedSkin;
                      const isActive = skin.id === skinsData.activeSkin;
                      return (
                        <SkinCard
                          key={skin.id}
                          skin={skin}
                          isSelected={isSelected}
                          isActive={isActive}
                          isLoading={isLoading}
                          actionLoading={actionLoading}
                          onSelectSkin={handleSelectSkin}
                          onRenameSkin={handleOpenRenameDialog}
                          onDeleteSkin={(skinId) =>
                            handleDeleteSkin(skinId, "skin")
                          }
                          isRenameDisabled={isSkinRenameDisabled()}
                          isDeleteDisabled={isSkinDeleteDisabled(skin)}
                          renameLabel={t("manageSkins.rename")}
                          deleteLabel={t("manageSkins.deleteSkin")}
                        />
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <Card className="min-w-0 gap-0 overflow-hidden py-0">
                <CardContent className="grid h-full min-h-0 p-3">
                  <div className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-1">
                    <SkinCanvas
                      skinUrl={selectedSkinEntry?.url || "steve"}
                      capeUrl={selectedCape?.url}
                      height={380}
                      width={270}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid min-h-0 min-w-0 content-start gap-3 overflow-y-auto pr-1">
                <Card className="gap-0 py-0">
                  <CardContent className="grid gap-3 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {t("manageSkins.settings")}
                      </p>
                      {skinsData.activeSkin === skinsData.selectedSkin ? (
                        <Badge variant="secondary">
                          <Check className="size-3" />
                          {t("manageSkins.active")}
                        </Badge>
                      ) : actionLoading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>

                    <div className="min-w-0 rounded-lg border bg-card px-3 py-2">
                      <ScrollingText
                        text={
                          selectedSkinEntry?.name ??
                          t("manageSkins.selectedSkin")
                        }
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedSkinEntry?.model === "slim"
                          ? t("manageSkins.slim")
                          : t("manageSkins.classic")}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">
                        {t("manageSkins.model")}
                      </Label>
                      <RadioGroup
                        className="grid gap-2"
                        value={selectedSkinEntry?.model ?? "classic"}
                        onValueChange={(value) =>
                          handleChangeModel(value as "classic" | "slim")
                        }
                      >
                        <Label
                          htmlFor="skin-model-classic"
                          className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary"
                        >
                          <RadioGroupItem
                            id="skin-model-classic"
                            value="classic"
                          />
                          <Mars className="size-4 text-muted-foreground" />
                          {t("manageSkins.classicModel")}
                        </Label>
                        <Label
                          htmlFor="skin-model-slim"
                          className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary"
                        >
                          <RadioGroupItem id="skin-model-slim" value="slim" />
                          <Venus className="size-4 text-muted-foreground" />
                          {t("manageSkins.slimModel")}
                        </Label>
                      </RadioGroup>
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-xs text-muted-foreground">
                        {t("manageSkins.cape")}
                      </Label>
                      <div className="flex gap-2">
                        <Select
                          value={selectedCape?.id ?? NO_CAPE_VALUE}
                          onValueChange={(value) =>
                            handleSetCape(
                              value === NO_CAPE_VALUE ? undefined : value,
                            )
                          }
                          disabled={actionLoading !== null}
                        >
                          <SelectTrigger className="w-0 min-w-0 flex-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_CAPE_VALUE}>
                              {t("manageSkins.noCape")}
                            </SelectItem>
                            {skinsData.capes.map((cape) => (
                              <SelectItem key={cape.id} value={cape.id}>
                                <span className="flex min-w-0 items-center gap-2">
                                  <img
                                    src={cape.cape || cape.url}
                                    className="h-8 w-auto shrink-0 object-contain"
                                    loading="lazy"
                                    alt=""
                                  />
                                  <span className="max-w-52 truncate">
                                    {cape.alias}
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedAccount.type === "discord" && (
                          <Button
                            variant="destructive"
                            size="icon"
                            disabled={
                              actionLoading !== null ||
                              !selectedCape ||
                              selectedCape.id === skinsData.activeCape
                            }
                            onClick={() =>
                              selectedCape &&
                              handleDeleteSkin(selectedCape.id, "cape")
                            }
                          >
                            <Trash className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <Button
                      disabled={
                        actionLoading !== null ||
                        !isRemoteSkinServiceAvailable ||
                        (skinsData.activeSkin === skinsData.selectedSkin &&
                          selectedSkinEntry?.model === skinsData.activeModel &&
                          selectedCape?.id === skinsData.activeCape)
                      }
                      onClick={handleApply}
                    >
                      {actionLoading === "apply" && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      {t("manageSkins.apply")}
                    </Button>

                    {selectedAccount.type !== "plain" && (
                      <Button
                        variant="secondary"
                        disabled={
                          actionLoading !== null ||
                          !isInternetOnline ||
                          !selectedSkinEntry ||
                          !selectedAccount.accessToken
                        }
                        onClick={() =>
                          selectedSkinEntry &&
                          handleOpenPublishDialog(selectedSkinEntry.id)
                        }
                      >
                        <Globe className="size-4" />
                        {t("manageSkins.publish")}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card className="gap-0 border-destructive/25 py-0">
                  <CardContent className="grid gap-2 p-3">
                    <Button
                      variant="destructive"
                      disabled={
                        actionLoading !== null ||
                        !selectedSkinEntry ||
                        isSkinDeleteDisabled(selectedSkinEntry)
                      }
                      onClick={() =>
                        selectedSkinEntry &&
                        handleDeleteSkin(selectedSkinEntry.id, "skin")
                      }
                    >
                      <Trash className="size-4" />
                      {t("manageSkins.deleteSkin")}
                    </Button>

                    {isMicrosoftAccount && (
                      <Button
                        variant="secondary"
                        disabled={
                          actionLoading !== null ||
                          !isRemoteSkinServiceAvailable
                        }
                        onClick={handleReset}
                      >
                        {actionLoading === "reset" && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {t("manageSkins.reset")}
                      </Button>
                    )}

                    {selectedAccount.type === "discord" && (
                      <Button
                        variant="secondary"
                        disabled={
                          actionLoading !== null ||
                          !isRemoteSkinServiceAvailable
                        }
                        onClick={handleRegenerate}
                      >
                        {actionLoading === "regenerate" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        {t("manageSkins.regenerate")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {skinsData && selectedAccount && (
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              if (open) setIsAddDialogOpen(true);
              else closeAddDialog();
            }}
          >
            <DialogContent
              aria-describedby={undefined}
              data-account-click-ignore="true"
              className="sm:max-w-xl"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3 pr-6">
                  <span className="flex items-center gap-2">
                    <FilePlus2 className="size-5" />
                    {skinType === "cape"
                      ? t("manageSkins.addCape")
                      : t("manageSkins.addSkin")}
                  </span>
                  {selectedAccount.type === "discord" && (
                    <Tabs
                      value={skinType}
                      onValueChange={(value) => {
                        setSkinType(value as "skin" | "cape");
                        setInputValue("");
                        setPickedFile(null);
                        if (value === "cape" && addSource === "nick") {
                          setAddSource("file");
                        }
                      }}
                    >
                      <TabsList>
                        <TabsTrigger value="skin">
                          {t("manageSkins.skin")}
                        </TabsTrigger>
                        <TabsTrigger value="cape">
                          {t("manageSkins.cape")}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Tabs
                  className="min-w-0"
                  value={addSource}
                  onValueChange={(value) =>
                    setAddSource(value as "file" | "link" | "nick")
                  }
                >
                  <TabsList variant="line" className="w-full justify-start">
                    <TabsTrigger value="file">
                      <FileImage className="size-4" />
                      {t("manageSkins.file")}
                    </TabsTrigger>
                    <TabsTrigger value="link">
                      <Link className="size-4" />
                      {t("manageSkins.link")}
                    </TabsTrigger>
                    {skinType === "skin" && (
                      <TabsTrigger value="nick">
                        <User className="size-4" />
                        {t("manageSkins.nickname")}
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="file" className="mt-3">
                    <button
                      type="button"
                      onClick={handlePickFile}
                      disabled={actionLoading !== null}
                      onDragEnter={(event) => {
                        if (
                          !Array.from(event.dataTransfer.types).includes(
                            "Files",
                          )
                        )
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        dragCounterRef.current += 1;
                        setIsDragOver(true);
                      }}
                      onDragOver={(event) => {
                        if (
                          !Array.from(event.dataTransfer.types).includes(
                            "Files",
                          )
                        )
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "copy";
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        dragCounterRef.current = Math.max(
                          0,
                          dragCounterRef.current - 1,
                        );
                        if (dragCounterRef.current === 0) setIsDragOver(false);
                      }}
                      onDrop={handleDropFile}
                      className={cn(
                        "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent/30",
                        isDragOver && "border-primary bg-primary/10",
                        actionLoading !== null &&
                          "pointer-events-none opacity-60",
                      )}
                    >
                      <Upload className="size-7 text-primary" />
                      <span className="text-sm font-medium">
                        {t("manageSkins.dropPng")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("manageSkins.dropPngHint")}
                      </span>
                    </button>
                    {pickedFile && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
                        <FileImage className="size-4 shrink-0 text-primary" />
                        <span
                          className="min-w-0 flex-1 truncate text-xs"
                          title={pickedFile.name}
                        >
                          {pickedFile.name}
                        </span>
                        <button
                          type="button"
                          aria-label={t("common.cancel")}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          onClick={() => setPickedFile(null)}
                          disabled={actionLoading !== null}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="link" className="mt-3 grid content-start gap-1.5">
                    <Label>{t("manageSkins.link")}</Label>
                    <Input
                      value={inputValue}
                      onChange={handleInputChange}
                      disabled={actionLoading !== null}
                      placeholder="https://…/skin.png"
                    />
                  </TabsContent>

                  {skinType === "skin" && (
                    <TabsContent value="nick" className="mt-3 grid content-start gap-1.5">
                      <Label>{t("manageSkins.nickname")}</Label>
                      <Input
                        value={inputValue}
                        onChange={handleInputChange}
                        disabled={actionLoading !== null}
                        placeholder="Notch"
                      />
                    </TabsContent>
                  )}
                </Tabs>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {t("manageSkins.preview")}
                  </span>
                  <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-2">
                    {addSource === "nick" ? (
                      <div className="flex flex-col items-center gap-2 px-2 text-center">
                        <User className="size-9 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {t("manageSkins.nickNoPreview")}
                        </span>
                      </div>
                    ) : addPreviewUrl ? (
                      skinType === "cape" ? (
                        selectedSkinEntry?.url ? (
                          <SkinCanvas
                            skinUrl={selectedSkinEntry.url}
                            capeUrl={addPreviewUrl}
                            width={150}
                            height={200}
                          />
                        ) : (
                          <img
                            src={addPreviewUrl}
                            alt=""
                            className="h-full max-h-[200px] w-auto object-contain"
                          />
                        )
                      ) : (
                        <SkinCanvas
                          skinUrl={addPreviewUrl}
                          width={150}
                          height={200}
                        />
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-2 px-2 text-center">
                        <ImageIcon className="size-9 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {t("manageSkins.previewHint")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={closeAddDialog}
                  disabled={actionLoading !== null}
                >
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleImport} disabled={isImportDisabled}>
                  {actionLoading === "byFile" ||
                  actionLoading === "byLink" ||
                  actionLoading === "byPlayer" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {t("manageSkins.import")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog
          open={renameDialogSkinId !== null}
          onOpenChange={(open) => {
            if (!open) setRenameDialogSkinId(null);
          }}
        >
          <DialogContent
            data-account-click-ignore="true"
            className="sm:max-w-sm"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>{t("manageSkins.rename")}</DialogTitle>
              <DialogDescription>
                {renameDialogSkin?.name ?? t("manageSkins.selectedSkin")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label>{t("manageSkins.rename")}</Label>
              <Input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                disabled={actionLoading !== null}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !isRenameSubmitDisabled) {
                    void handleSubmitRename();
                  }
                }}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={actionLoading !== null}
                onClick={() => setRenameDialogSkinId(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={isRenameSubmitDisabled}
                onClick={() => void handleSubmitRename()}
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={publishDialogSkinId !== null}
          onOpenChange={(open) => {
            if (!open && actionLoading !== "publish") setPublishDialogSkinId(null);
          }}
        >
          <DialogContent
            data-account-click-ignore="true"
            className="sm:max-w-sm"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Globe className="size-5" />
                {t("manageSkins.publishTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("manageSkins.publishNote")}
              </DialogDescription>
            </DialogHeader>

            {publishDialogSkin && (
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                  <SkinCanvas
                    skinUrl={publishDialogSkin.url}
                    capeUrl={publishDialogCape?.url}
                    height={90}
                    width={56}
                  />
                </div>
                <div className="grid flex-1 gap-2">
                  <Label>{t("manageSkins.publishName")}</Label>
                  <Input
                    value={publishName}
                    maxLength={40}
                    onChange={(event) => setPublishName(event.target.value)}
                    disabled={actionLoading !== null}
                  />
                </div>
              </div>
            )}

            {publishDialogCape && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("manageSkins.publishWhat")}
                </Label>
                <div className="flex gap-1.5">
                  {(["skin", "pack", "cape"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPublishType(value)}
                      disabled={actionLoading !== null}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                        publishType === value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {t(`manageSkins.publishType_${value}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("manageSkins.tagsLabel")}
              </Label>
              <TagsInput
                value={publishTags}
                onChange={setPublishTags}
                disabled={actionLoading !== null}
                placeholder={t("manageSkins.tagsPlaceholder")}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={actionLoading !== null}
                onClick={() => setPublishDialogSkinId(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={actionLoading !== null || !publishName.trim()}
                onClick={() => void handlePublish()}
              >
                {actionLoading === "publish" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Globe className="size-4" />
                )}
                {t("manageSkins.publish")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
