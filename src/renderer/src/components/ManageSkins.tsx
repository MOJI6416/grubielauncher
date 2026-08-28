import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { ICatalogSkin } from "@/types/SkinManager";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  internetAtom,
  networkAtom,
  pendingSkinDeepLinkAtom,
} from "@renderer/stores/atoms";
import { canOpenSkinManagerForAccount } from "@renderer/utilities/connectivity";
import { showFailureToast } from "@renderer/utilities/failures";
import { CatalogPanel } from "@renderer/features/skins/CatalogPanel";
import { WardrobePanel } from "@renderer/features/skins/WardrobePanel";
import { useSkinsData } from "@renderer/features/skins/useSkinsData";

const api = window.api;

type Mode = "wardrobe" | "catalog";

export function ManageSkins() {
  const { t } = useTranslation();
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const [pendingSkinDeepLink, setPendingSkinDeepLink] = useAtom(
    pendingSkinDeepLinkAtom,
  );

  const { data, setData, status, reload, account, authData, backendToken } =
    useSkinsData();

  const [mode, setMode] = useState<Mode>("wardrobe");
  const [deepLinkSkinId, setDeepLinkSkinId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      if (!(await reload())) {
        showFailureToast(t("manageSkins.loadErrorTitle"), null, {
          channels: ["skins:load"],
        });
      }
    } finally {
      setIsRetrying(false);
    }
  }, [reload, t]);

  useEffect(() => {
    if (!pendingSkinDeepLink) return;

    setDeepLinkSkinId(pendingSkinDeepLink);
    setMode("catalog");
    setPendingSkinDeepLink(null);
  }, [pendingSkinDeepLink, setPendingSkinDeepLink]);

  const canUseSkinService = useMemo(
    () =>
      account?.type !== "elyby" &&
      canOpenSkinManagerForAccount(account?.type, {
        isInternetOnline,
        isBackendOnline,
      }),
    [account?.type, isBackendOnline, isInternetOnline],
  );

  const handleImportFromCatalog = useCallback(
    async (skin: ICatalogSkin) => {
      if (!authData || !account) return;

      setIsImporting(true);
      try {
        let imported = false;

        if (skin.type === "cape") {
          imported = Boolean(
            skin.capeUrl &&
              (await api.skins.importByUrl(
                authData.uuid,
                account.type,
                skin.capeUrl,
                "cape",
              )),
          );
        } else if (skin.type === "pack") {
          imported = Boolean(
            skin.skinUrl &&
              skin.capeUrl &&
              (
                await api.skins.importPack(
                  authData.uuid,
                  account.type,
                  skin.skinUrl,
                  skin.capeUrl,
                )
              ).ok,
          );
        } else {
          imported = Boolean(
            skin.skinUrl &&
              (await api.skins.importByUrl(
                authData.uuid,
                account.type,
                skin.skinUrl,
                "skin",
              )),
          );
        }

        if (!imported) {
          showFailureToast(t("manageSkins.importError"), null, {
            channels: ["skins:"],
          });
          return;
        }

        void api.skins.catalog.download(skin.id).catch(() => undefined);

        const refreshed = await reload();

        if (!refreshed) {
          showFailureToast(t("manageSkins.importedNotShown"), null, {
            channels: ["skins:"],
            fallbackDescription: t("manageSkins.importedNotShownHint"),
          });
          return;
        }

        toast.success(t("manageSkins.catalogImported"));
        setMode("wardrobe");
      } catch (error) {
        showFailureToast(t("manageSkins.importError"), error, {
          channels: ["skins:"],
        });
      } finally {
        setIsImporting(false);
      }
    },
    [account, authData, reload, t],
  );

  const modeSwitch = (
    <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5">
      {(["wardrobe", "catalog"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setMode(value)}
          className={cn(
            "h-7 rounded-md px-3 text-xs font-medium transition-colors",
            mode === value
              ? "bg-surface-3 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === "wardrobe"
            ? t("manageSkins.tabMine")
            : t("manageSkins.tabCatalog")}
        </button>
      ))}
    </div>
  );

  if (mode === "catalog") {
    return (
      <CatalogPanel
        modeSwitch={modeSwitch}
        onImport={handleImportFromCatalog}
        isOnline={isInternetOnline}
        disabled={isImporting || !data || !account || !authData}
        backendToken={backendToken}
        initialSkinId={deepLinkSkinId}
        playerSkinUrl={
          data?.skins.skins.find((skin) => skin.id === data.activeSkin)?.url
        }
      />
    );
  }

  if (status === "loading") {
    return (
      <div aria-busy className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex h-8 shrink-0 items-center gap-2">
          {modeSwitch}
          <Skeleton className="ml-auto h-8 w-52 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_300px]">
          <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(104px,1fr))] content-start gap-2 overflow-hidden rounded-xl border border-border bg-surface-1 p-2.5">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-26 w-full rounded-lg" />
            ))}
          </div>

          <Skeleton className="min-h-0 rounded-xl" />

          <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-surface-1 p-3">
            <Skeleton className="h-3.5 w-32 shrink-0 rounded" />
            <Skeleton className="h-2.5 w-24 shrink-0 rounded" />
            <Skeleton className="h-9 w-full shrink-0 rounded-lg" />
            <Skeleton className="min-h-0 w-full flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!data || !account || !authData) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex h-8 shrink-0 items-center">{modeSwitch}</div>
        <Empty className="min-h-0 flex-1 rounded-xl border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>{t("manageSkins.loadErrorTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("manageSkins.loadErrorHint")}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="secondary"
            disabled={isRetrying}
            onClick={() => void handleRetry()}
          >
            {isRetrying ? <Loader2 className="animate-spin" /> : null}
            {t("common.retry")}
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <WardrobePanel
      modeSwitch={modeSwitch}
      data={data}
      setData={setData}
      reload={reload}
      account={account}
      authData={authData}
      isInternetOnline={isInternetOnline}
      canUseSkinService={canUseSkinService}
    />
  );
}
