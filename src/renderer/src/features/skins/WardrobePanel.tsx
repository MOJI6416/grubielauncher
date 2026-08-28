import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Download,
  Ellipsis,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shirt,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { ICape, ISkinEntry, SkinsData } from "@/types/SkinManager";
import type { IAuth, ILocalAccount } from "@/types/Account";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { pathsAtom, rpcSkinVersionAtom } from "@renderer/stores/atoms";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { showFailureToast } from "@renderer/utilities/failures";
import type { FailureInfo } from "@/shared/errors";
import type { TFunction } from "i18next";
import { AddSkinDialog, AddSkinRequest } from "./AddSkinDialog";
import { PublishSkinDialog, PublishType } from "./PublishSkinDialog";
import { SkinHead } from "./SkinHead";
import { SkinStage } from "./SkinStage";
import { detectModelFromUrl, fetchTextureBytes } from "./skinPixels";
import { useSkinTexture } from "./useSkinTexture";
import {
  buildSkinList,
  canDeleteSkin,
  capeLabel,
  countSkinFilters,
  exportFileName,
  findCape,
  isGeneratedSkinName,
  pendingSkinChanges,
  pickSelectedSkinId,
  shortSkinLabel,
  SKIN_FILTERS,
  SKIN_SORTS,
  SkinFilter,
  SkinSort,
  toggleFavorite,
} from "./skinLibrary";
import { readFavorites, writeFavorites } from "./favorites";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;
const ELYBY_SKINS_URL = "https://ely.by/skins";

type Busy =
  | "apply"
  | "import"
  | "reset"
  | "regenerate"
  | "publish"
  | "delete"
  | "export"
  | "model"
  | null;

const skinErrorDescription =
  (t: TFunction) =>
  (info: FailureInfo | null): string | undefined => {
    const code = info?.message ?? "";
    if (!/^[a-z0-9_]+$/.test(code)) return undefined;

    return t(`manageSkins.errors.${code}`, { defaultValue: "" }) || undefined;
  };

function SkinTile({
  skin,
  isSelected,
  isActive,
  isFavorite,
  hasCape,
  disabled,
  onSelect,
  onApply,
}: {
  skin: ISkinEntry;
  isSelected: boolean;
  isActive: boolean;
  isFavorite: boolean;
  hasCape: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onApply: (id: string) => void;
}) {
  const generated = isGeneratedSkinName(skin.name);

  return (
    <Hint content={skin.name} variant="text">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={isSelected}
        onClick={() => onSelect(skin.id)}
        onDoubleClick={() => onApply(skin.id)}
        className={cn(
          "relative flex flex-col items-center gap-1 rounded-xl border border-border bg-surface-2 p-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
          isSelected
            ? "border-primary/60 bg-primary-soft"
            : "hover:border-border hover:bg-surface-3",
        )}
      >
        {skin.character ? (
          <img
            src={resolveLocalImage(skin.character)}
            width={48}
            height={96}
            loading="lazy"
            alt=""
            className="h-24 w-12 object-contain [image-rendering:pixelated]"
          />
        ) : (
          <span className="flex h-24 items-center">
            <SkinHead url={skin.url} size={48} />
          </span>
        )}

        <span
          className={cn(
            "w-full truncate text-center text-[11px] leading-4",
            generated ? "font-mono text-faint" : "text-muted-foreground",
          )}
        >
          {shortSkinLabel(skin.name)}
        </span>

        {isActive ? (
          <span
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-success ring-2 ring-surface-2"
            aria-hidden="true"
          />
        ) : null}

        <span className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          {isFavorite ? (
            <Star className="size-3 fill-warning text-warning" />
          ) : null}
          {hasCape ? <Shirt className="size-3 text-faint" /> : null}
        </span>
      </button>
    </Hint>
  );
}

export function WardrobePanel({
  data,
  setData,
  reload,
  account,
  authData,
  isInternetOnline,
  canUseSkinService,
  modeSwitch,
}: {
  data: SkinsData;
  setData: (next: SkinsData) => void;
  reload: () => Promise<SkinsData | null>;
  account: ILocalAccount;
  authData: IAuth;
  isInternetOnline: boolean;
  canUseSkinService: boolean;
  modeSwitch: ReactNode;
}) {
  const { t } = useTranslation();
  const paths = useAtomValue(pathsAtom);
  const bumpRpcSkinVersion = useSetAtom(rpcSkinVersionAtom);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkinFilter>("all");
  const [sort, setSort] = useState<SkinSort>("recent");
  const [busy, setBusy] = useState<Busy>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteCapeId, setDeleteCapeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const accountKey = `${account.type}_${account.nickname}`;
  const [favorites, setFavorites] = useState<string[]>(() =>
    readFavorites(accountKey),
  );

  useEffect(() => {
    setFavorites(readFavorites(accountKey));
  }, [accountKey]);

  const skins = data.skins.skins;
  const isDiscord = account.type === "discord";
  const isMicrosoft = account.type === "microsoft";
  const isElyby = account.type === "elyby";

  const selectedId = useMemo(
    () => pickSelectedSkinId(skins, data.selectedSkin),
    [skins, data.selectedSkin],
  );
  const selected = useMemo(
    () => skins.find((skin) => skin.id === selectedId) ?? null,
    [skins, selectedId],
  );
  const selectedCape = useMemo(
    () => findCape(data.capes, selected?.capeId),
    [data.capes, selected?.capeId],
  );
  const activeSkin = useMemo(
    () => skins.find((skin) => skin.id === data.activeSkin) ?? null,
    [skins, data.activeSkin],
  );

  const list = useMemo(
    () =>
      buildSkinList({
        skins,
        query,
        filter,
        sort,
        favorites,
        activeSkin: data.activeSkin,
      }),
    [skins, query, filter, sort, favorites, data.activeSkin],
  );
  const counts = useMemo(
    () => countSkinFilters(skins, favorites),
    [skins, favorites],
  );

  const changes = useMemo(
    () =>
      pendingSkinChanges(
        {
          activeSkin: data.activeSkin,
          activeCape: data.activeCape,
          activeModel: data.activeModel,
        },
        {
          skinId: selected?.id,
          model: selected?.model,
          capeId: selected?.capeId,
        },
      ),
    [data.activeCape, data.activeModel, data.activeSkin, selected],
  );

  const texture = useSkinTexture(selected?.url);

  useEffect(() => {
    setRenameValue(null);
  }, [selected?.id]);

  useEffect(() => {
    if (renameValue !== null) renameRef.current?.focus();
  }, [renameValue]);

  const failureOptions = useMemo(
    () => ({
      channels: ["skins:"],
      fallbackDescription: skinErrorDescription(t),
    }),
    [t],
  );

  const runSkinAction = useCallback(
    async (
      kind: Exclude<Busy, null>,
      action: () => Promise<SkinsData | null>,
      errorTitle: string,
    ): Promise<boolean> => {
      setBusy(kind);
      try {
        const next = await action();
        if (!next) throw new Error("skins_action_failed");

        setData(next);
        bumpRpcSkinVersion(Date.now());

        return true;
      } catch (error) {
        showFailureToast(errorTitle, error, failureOptions);
        await reload().catch(() => undefined);

        return false;
      } finally {
        setBusy(null);
      }
    },
    [bumpRpcSkinVersion, failureOptions, reload, setData],
  );

  const handleSelect = useCallback(
    async (skinId: string): Promise<boolean> => {
      const previous = data;
      setData({ ...data, selectedSkin: skinId });

      const next = await api.skins.selectSkin(
        authData.uuid,
        account.type,
        skinId,
      );
      if (!next) {
        setData(previous);
        showFailureToast(t("manageSkins.selectError"), null, failureOptions);

        return false;
      }

      setData(next);

      return true;
    },
    [account.type, authData.uuid, data, failureOptions, setData, t],
  );

  const handleToggleFavorite = useCallback(
    (skinId: string) => {
      setFavorites((prev) => {
        const next = toggleFavorite(prev, skinId);
        writeFavorites(accountKey, next);

        return next;
      });
    },
    [accountKey],
  );

  const handleModel = useCallback(
    async (model: "classic" | "slim"): Promise<boolean> => {
      if (!selected || selected.model === model) return false;

      return await runSkinAction(
        "model",
        () => api.skins.changeModel(authData.uuid, account.type, model),
        t("manageSkins.applyError"),
      );
    },
    [account.type, authData.uuid, runSkinAction, selected, t],
  );

  const handleDetectModel = useCallback(async () => {
    if (!selected) return;

    const detected = await detectModelFromUrl(selected.url);
    if (!detected) {
      toast.error(t("manageSkins.detectFailed"));
      return;
    }

    if (detected === selected.model) {
      toast.success(t("manageSkins.detectSame"));
      return;
    }

    if (!(await handleModel(detected))) return;

    toast.success(
      t("manageSkins.detectApplied", {
        model:
          detected === "slim"
            ? t("manageSkins.slim")
            : t("manageSkins.classic"),
      }),
    );
  }, [handleModel, selected, t]);

  const handleCape = useCallback(
    async (capeId: string | undefined) => {
      await runSkinAction(
        "apply",
        () => api.skins.setCape(authData.uuid, account.type, capeId),
        t("manageSkins.applyError"),
      );
    },
    [account.type, authData.uuid, runSkinAction, t],
  );

  const handleApply = useCallback(
    async (skinId?: string) => {
      const target = skinId ?? selected?.id;
      if (!target || !canUseSkinService) return;

      if (skinId && skinId !== selected?.id) {
        if (!(await handleSelect(skinId))) return;
      }

      await runSkinAction(
        "apply",
        () => api.skins.uploadSkin(authData.uuid, account.type, target),
        t("manageSkins.applyError"),
      );
    },
    [
      account.type,
      authData.uuid,
      canUseSkinService,
      handleSelect,
      runSkinAction,
      selected?.id,
      t,
    ],
  );

  const handleReset = useCallback(async () => {
    await runSkinAction(
      "reset",
      () => api.skins.resetSkin(authData.uuid, account.type),
      t("manageSkins.applyError"),
    );
  }, [account.type, authData.uuid, runSkinAction, t]);

  const handleRegenerate = useCallback(async () => {
    await runSkinAction(
      "regenerate",
      () => api.skins.regenerateSkin(authData.uuid, account.type),
      t("manageSkins.applyError"),
    );
  }, [account.type, authData.uuid, runSkinAction, t]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;

    await runSkinAction(
      "delete",
      () => api.skins.deleteSkin(authData.uuid, account.type, deleteId, "skin"),
      t("manageSkins.deleteError"),
    );
    setDeleteId(null);
  }, [account.type, authData.uuid, deleteId, runSkinAction, t]);

  const handleDeleteCape = useCallback(async () => {
    if (!deleteCapeId) return;

    await runSkinAction(
      "delete",
      () =>
        api.skins.deleteSkin(authData.uuid, account.type, deleteCapeId, "cape"),
      t("manageSkins.deleteError"),
    );
    setDeleteCapeId(null);
  }, [account.type, authData.uuid, deleteCapeId, runSkinAction, t]);

  const handleRename = useCallback(async () => {
    const nextName = renameValue?.trim() ?? "";
    if (!selected || !nextName || nextName === selected.name) {
      setRenameValue(null);
      return;
    }

    const taken = skins.some(
      (skin) => skin.id !== selected.id && skin.name === nextName,
    );
    if (taken) {
      toast.error(t("manageSkins.renameTaken"));
      return;
    }

    const next = await api.skins.renameSkin(
      authData.uuid,
      account.type,
      selected.id,
      nextName,
    );
    if (!next) {
      showFailureToast(t("manageSkins.renameError"), null, failureOptions);
      return;
    }

    setData(next);
    setRenameValue(null);
  }, [
    account.type,
    authData.uuid,
    failureOptions,
    renameValue,
    selected,
    setData,
    skins,
    t,
  ]);

  const handleImport = useCallback(
    async (request: AddSkinRequest) => {
      setBusy("import");
      try {
        let next: SkinsData | null = null;

        if (request.source === "file" && request.filePath) {
          next = await api.skins.importByFile(
            authData.uuid,
            account.type,
            request.filePath,
            request.type,
          );
        } else if (request.source === "nick" && request.value) {
          next = await api.skins.importByNickname(
            authData.uuid,
            account.type,
            request.value,
          );
        } else if (request.value) {
          next = await api.skins.importByUrl(
            authData.uuid,
            account.type,
            request.value,
            request.type,
          );
        }

        if (!next) {
          showFailureToast(t("manageSkins.importError"), null, failureOptions);
          return false;
        }

        setData(next);
        toast.success(t("manageSkins.imported"));
        return true;
      } catch (error) {
        showFailureToast(t("manageSkins.importError"), error, failureOptions);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [account.type, authData.uuid, failureOptions, setData, t],
  );

  const handlePublish = useCallback(
    async ({
      name,
      type,
      tags,
    }: {
      name: string;
      type: PublishType;
      tags: string[];
    }) => {
      if (!publishId || !account.accessToken) return;

      setBusy("publish");
      try {
        const result = await api.skins.publishCommunity(
          authData.uuid,
          account.type,
          publishId,
          account.accessToken,
          name || undefined,
          type,
          tags.join(","),
        );

        if (result.ok) {
          toast.success(t("manageSkins.publishPending"));
          setPublishId(null);
          return;
        }

        if (result.error === "duplicate") {
          toast.error(
            result.dupStatus === "rejected"
              ? result.reason
                ? t("manageSkins.publishRejected", { reason: result.reason })
                : t("manageSkins.publishRejectedNoReason")
              : t("manageSkins.publishDuplicate"),
          );
          return;
        }

        if (result.error === "limit") {
          toast.error(t("manageSkins.publishLimit"));
          return;
        }

        showFailureToast(t("manageSkins.publishError"), undefined, {
          channels: ["skins:"],
          fallbackDescription: result.error
            ? t(`manageSkins.errors.${result.error}`, { defaultValue: "" }) ||
              t("errors.serverCode", { code: result.error })
            : undefined,
        });
      } finally {
        setBusy(null);
      }
    },
    [account.accessToken, account.type, authData.uuid, publishId, t],
  );

  const handleExport = useCallback(async () => {
    if (!selected) return;

    setBusy("export");
    try {
      const bytes = await fetchTextureBytes(selected.url);
      if (!bytes) throw new Error("texture_unavailable");

      const folder = api.path.join(paths.launcher, "skins", "export");
      await api.fs.ensure(folder);

      const target = api.path.join(
        folder,
        exportFileName(selected.name, selected.hash),
      );
      const written = await api.fs.writeFile(target, bytes);
      if (!written) throw new Error("export_failed");

      toast.success(t("manageSkins.exportDone"), {
        action: {
          label: t("manageSkins.openFolder"),
          onClick: () => void api.shell.openPath(folder).catch(() => undefined),
        },
      });
    } catch (error) {
      showFailureToast(t("manageSkins.exportError"), error, failureOptions);
    } finally {
      setBusy(null);
    }
  }, [failureOptions, paths.launcher, selected, t]);

  const deleteTarget = useMemo(
    () => skins.find((skin) => skin.id === deleteId) ?? null,
    [deleteId, skins],
  );
  const deleteCapeTarget = useMemo(
    () => findCape(data.capes, deleteCapeId ?? undefined),
    [data.capes, deleteCapeId],
  );

  const isApplied = changes.length === 0 && Boolean(selected);
  const isFavorite = Boolean(selected && favorites.includes(selected.id));
  const isBusy = busy !== null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        {modeSwitch}

        <div className="relative ml-auto w-52">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("manageSkins.searchOwn")}
            className="h-8 pr-8 pl-8"
          />
          {query ? (
            <button
              type="button"
              aria-label={t("manageSkins.resetFilters")}
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {t(`manageSkins.filter_${filter}`)}
              <span className="text-faint tabular-nums">{counts[filter]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={filter}
              onValueChange={(value) => setFilter(value as SkinFilter)}
            >
              {SKIN_FILTERS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t(`manageSkins.filter_${value}`)}
                  <span className="ml-auto pl-3 text-faint tabular-nums">
                    {counts[value]}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as SkinSort)}
            >
              {SKIN_SORTS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t(`manageSkins.sortOwn_${value}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="secondary"
          size="sm"
          disabled={isBusy}
          onClick={() => setIsAddOpen(true)}
        >
          <Plus />
          {t("common.add")}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_300px]">
        {list.length === 0 ? (
          <Empty className="min-h-0 rounded-xl border border-dashed border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Shirt />
              </EmptyMedia>
              <EmptyTitle>
                {skins.length === 0
                  ? t("manageSkins.emptyTitle")
                  : t("manageSkins.noMatches")}
              </EmptyTitle>
              <EmptyDescription>
                {skins.length === 0
                  ? t("manageSkins.emptyHint")
                  : t("manageSkins.noMatchesHint")}
              </EmptyDescription>
            </EmptyHeader>
            {skins.length === 0 ? (
              <Button variant="secondary" onClick={() => setIsAddOpen(true)}>
                <Plus />
                {t("manageSkins.addSkin")}
              </Button>
            ) : null}
          </Empty>
        ) : (
          <ScrollArea className="min-h-0 rounded-xl border border-border bg-surface-1">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2 p-2.5">
              {list.map((skin) => (
                <SkinTile
                  key={skin.id}
                  skin={skin}
                  isSelected={skin.id === selectedId}
                  isActive={skin.id === data.activeSkin}
                  isFavorite={favorites.includes(skin.id)}
                  hasCape={Boolean(skin.capeId)}
                  disabled={isBusy}
                  onSelect={(id) => void handleSelect(id)}
                  onApply={(id) => void handleApply(id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <SkinStage
          className="min-h-0"
          skinUrl={selected?.url}
          capeUrl={selectedCape?.url}
          model={selected?.model ?? "auto"}
          nickname={account.nickname}
          minHeight={240}
          badges={
            <>
              <Badge variant="secondary" className="tabular-nums">
                {selected?.model === "slim"
                  ? t("manageSkins.slim")
                  : t("manageSkins.classic")}
              </Badge>
              {texture.status === "ready" && texture.texture.info.legacy ? (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-warning"
                >
                  {t("manageSkins.legacyFormat")}
                </Badge>
              ) : null}
            </>
          }
        />

        <div className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex min-w-0 items-center gap-1">
            {renameValue === null ? (
              <>
                <Hint content={selected?.name} variant="text">
                  <p
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-medium",
                      selected && isGeneratedSkinName(selected.name)
                        ? "font-mono text-muted-foreground"
                        : null,
                    )}
                  >
                    {selected
                      ? shortSkinLabel(selected.name, 12)
                      : t("manageSkins.selectedSkin")}
                  </p>
                </Hint>
                <Hint
                  content={
                    isFavorite
                      ? t("manageSkins.favoriteOff")
                      : t("manageSkins.favoriteOn")
                  }
                >
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={!selected}
                    aria-pressed={isFavorite}
                    aria-label={
                      isFavorite
                        ? t("manageSkins.favoriteOff")
                        : t("manageSkins.favoriteOn")
                    }
                    onClick={() =>
                      selected && handleToggleFavorite(selected.id)
                    }
                  >
                    <Star
                      className={cn(isFavorite && "fill-warning text-warning")}
                    />
                  </Button>
                </Hint>
                <Hint content={t("manageSkins.rename")}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={!selected || isBusy}
                    aria-label={t("manageSkins.rename")}
                    onClick={() => setRenameValue(selected?.name ?? "")}
                  >
                    <Pencil />
                  </Button>
                </Hint>
              </>
            ) : (
              <Input
                ref={renameRef}
                value={renameValue}
                maxLength={40}
                className="h-7"
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => void handleRename()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleRename();
                  if (event.key === "Escape") setRenameValue(null);
                }}
              />
            )}
          </div>

          <div className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("manageSkins.model")}
            </span>
            <div className="flex gap-1.5">
              {(["classic", "slim"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!selected || isBusy}
                  onClick={() => void handleModel(value)}
                  className={cn(
                    "h-8 flex-1 rounded-lg border border-border text-xs font-medium transition-colors disabled:opacity-50",
                    selected?.model === value
                      ? "border-primary/60 bg-primary-soft text-foreground"
                      : "text-muted-foreground hover:bg-surface-3",
                  )}
                >
                  {value === "classic"
                    ? t("manageSkins.classic")
                    : t("manageSkins.slim")}
                </button>
              ))}
              <Hint content={t("manageSkins.detectModel")}>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!selected || isBusy}
                  aria-label={t("manageSkins.detectModel")}
                  onClick={() => void handleDetectModel()}
                >
                  <Wand2 />
                </Button>
              </Hint>
            </div>
          </div>

          <FactRows surface="card" framed className="shrink-0">
            <FactRow
              label={t("manageSkins.metaResolution")}
              value={
                <span className="font-mono tabular-nums">
                  {texture.status === "ready"
                    ? `${texture.texture.info.width}×${texture.texture.info.height}`
                    : "—"}
                </span>
              }
            />
            <FactRow
              label={t("manageSkins.metaFormat")}
              value={
                texture.status === "ready"
                  ? texture.texture.info.legacy
                    ? t("manageSkins.metaFormatLegacy")
                    : t("manageSkins.metaFormatModern")
                  : "—"
              }
            />
            <FactRow
              label={t("manageSkins.metaId")}
              value={
                <Hint content={t("common.copy")}>
                  <button
                    type="button"
                    disabled={!selected}
                    aria-label={t("common.copy")}
                    onClick={async () => {
                      if (!selected) return;
                      if (!(await copyToClipboard(selected.hash))) return;
                      toast.success(t("manageSkins.idCopied"));
                    }}
                    className="font-mono text-faint transition-colors hover:text-foreground"
                  >
                    {selected ? selected.hash.slice(0, 12) : "—"}
                  </button>
                </Hint>
              }
            />
          </FactRows>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t("manageSkins.cape")}
              </span>
              <span className="text-[11px] text-faint tabular-nums">
                {data.capes.length}
              </span>
            </div>
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(44px,1fr))] content-start gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-1 p-1.5">
              <Hint content={t("manageSkins.noCape")}>
                <button
                  type="button"
                  disabled={!selected || isBusy}
                  aria-label={t("manageSkins.noCape")}
                  onClick={() => void handleCape(undefined)}
                  className={cn(
                    "flex h-16 w-full items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors disabled:opacity-50",
                    selectedCape
                      ? "hover:bg-surface-3"
                      : "border-primary/60 bg-primary-soft text-foreground",
                  )}
                >
                  <X className="size-4" />
                </button>
              </Hint>

              {data.capes.map((cape: ICape) => (
                <Hint
                  key={cape.id}
                  content={capeLabel(cape, t("manageSkins.cape"))}
                >
                  <button
                    type="button"
                    disabled={!selected || isBusy}
                    aria-label={capeLabel(cape, t("manageSkins.cape"))}
                    onClick={() => void handleCape(cape.id)}
                    className={cn(
                      "h-16 w-full overflow-hidden rounded-lg border border-border p-0.5 transition-colors disabled:opacity-50",
                      cape.id === selectedCape?.id
                        ? "border-primary/60 bg-primary-soft"
                        : "hover:bg-surface-3",
                    )}
                  >
                    <img
                      src={resolveLocalImage(cape.cape || cape.url)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain [image-rendering:pixelated]"
                    />
                  </button>
                </Hint>
              ))}
            </div>
          </div>

          {!isApplied && activeSkin && selected ? (
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1.5">
              <SkinHead url={activeSkin.url} size={28} />
              <ArrowRight className="size-3.5 shrink-0 text-faint" />
              <SkinHead url={selected.url} size={28} />
              <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground">
                {changes
                  .map((change) => t(`manageSkins.change_${change}`))
                  .join(" · ")}
              </span>
            </div>
          ) : null}

          <div className="grid shrink-0 gap-2">
            {isElyby ? (
              <div className="grid gap-1.5 rounded-lg border border-border bg-surface-1 p-2.5">
                <p className="text-xs text-muted-foreground">
                  {t("manageSkins.elybyReadOnly")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void api.shell
                      .openExternal(ELYBY_SKINS_URL)
                      .catch(() => undefined)
                  }
                >
                  <ExternalLink />
                  {t("manageSkins.elybyOpenSite")}
                </Button>
              </div>
            ) : isApplied ? (
              <div className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-success/40 bg-surface-1 text-xs font-medium text-foreground">
                <Check className="size-3.5 text-success" />
                {t("manageSkins.applied")}
              </div>
            ) : (
              <>
                <Button
                  disabled={!selected || isBusy || !canUseSkinService}
                  onClick={() => void handleApply()}
                >
                  {busy === "apply" ? (
                    <Loader2 className="animate-spin" />
                  ) : null}
                  {t("manageSkins.apply")}
                </Button>
                {canUseSkinService ? null : (
                  <p className="text-[11px] leading-4 text-warning">
                    {t("manageSkins.applyUnavailable")}
                  </p>
                )}
              </>
            )}

            <div className="flex gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                disabled={
                  !selected ||
                  isBusy ||
                  !isInternetOnline ||
                  !account.accessToken
                }
                onClick={() => selected && setPublishId(selected.id)}
              >
                <Globe />
                {t("manageSkins.publish")}
              </Button>

              <Hint content={t("manageSkins.export")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!selected || isBusy}
                  aria-label={t("manageSkins.export")}
                  onClick={() => void handleExport()}
                >
                  {busy === "export" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                </Button>
              </Hint>

              <DropdownMenu>
                <Hint content={t("common.more")}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={isBusy}
                      aria-label={t("common.more")}
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                </Hint>
                <DropdownMenuContent align="end">
                  {isMicrosoft ? (
                    <DropdownMenuItem
                      disabled={!canUseSkinService}
                      onSelect={() => void handleReset()}
                    >
                      <Sparkles />
                      {t("manageSkins.reset")}
                    </DropdownMenuItem>
                  ) : null}
                  {isDiscord ? (
                    <DropdownMenuItem
                      disabled={!canUseSkinService}
                      onSelect={() => void handleRegenerate()}
                    >
                      <Sparkles />
                      {t("manageSkins.regenerate")}
                    </DropdownMenuItem>
                  ) : null}
                  {isDiscord && selectedCape ? (
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={selectedCape.id === data.activeCape}
                      onSelect={() => setDeleteCapeId(selectedCape.id)}
                    >
                      <Trash2 />
                      {t("manageSkins.deleteCape")}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={
                      !canDeleteSkin(selected, { activeSkin: data.activeSkin })
                    }
                    onSelect={() => selected && setDeleteId(selected.id)}
                  >
                    <Trash2 />
                    {t("manageSkins.deleteSkin")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <AddSkinDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        allowCape={isDiscord}
        isOnline={isInternetOnline}
        busy={busy === "import"}
        playerSkinUrl={activeSkin?.url}
        onSubmit={handleImport}
      />

      <PublishSkinDialog
        skin={skins.find((skin) => skin.id === publishId) ?? null}
        cape={findCape(
          data.capes,
          skins.find((skin) => skin.id === publishId)?.capeId,
        )}
        busy={busy === "publish"}
        onClose={() => setPublishId(null)}
        onPublish={handlePublish}
      />

      {deleteCapeTarget ? (
        <Confirmation
          title={t("manageSkins.deleteCape")}
          reversible={false}
          content={[
            {
              text: t("manageSkins.deleteCapeConfirm", {
                name: capeLabel(deleteCapeTarget, t("manageSkins.cape")),
              }),
            },
          ]}
          onClose={() => setDeleteCapeId(null)}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setDeleteCapeId(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => handleDeleteCape(),
            },
          ]}
        />
      ) : null}

      {deleteTarget ? (
        <Confirmation
          title={t("manageSkins.deleteSkin")}
          reversible={false}
          content={[
            {
              text: t("manageSkins.deleteConfirm", { name: deleteTarget.name }),
            },
          ]}
          onClose={() => setDeleteId(null)}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setDeleteId(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => handleDelete(),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
