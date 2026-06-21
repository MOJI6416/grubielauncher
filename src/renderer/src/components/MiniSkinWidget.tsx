import { ISkinData } from "@/types/Skin";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  internetAtom,
  networkAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { Loader2, Shirt } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { SkinViewer } from "skinview3d";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "@renderer/utilities/accountSession";
import { toast } from "sonner";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import { LazyDialogFallback } from "./LazyDialogFallback";
import {
  canLoadSkinPreviewForProvider,
  canOpenSkinManagerForAccount,
} from "@renderer/utilities/connectivity";

const api = window.api;
const loadReactSkinview3d = () => import("react-skinview3d");
const loadManageSkins = () =>
  import("./ManageSkins").then((module) => ({ default: module.ManageSkins }));

const ReactSkinview3d = lazy(loadReactSkinview3d);
const LazyManageSkins = lazyWithPreload(loadManageSkins);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const BASE_PLAYER_ROTATION_Y = 0.4;
const MISSING_SKIN_RETRY_MS = 15_000;
const BACKGROUND_SKIN_REFRESH_MS = 5 * 60_000;

export function MiniSkinWidget() {
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [authData] = useAtom(authDataAtom);
  const [isInternetOnline] = useAtom(internetAtom);
  const [isBackendOnline] = useAtom(networkAtom);
  const [preview, setPreview] = useState<ISkinData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpeningManager, setIsOpeningManager] = useState(false);
  const [isManageSkinsOpen, setIsManageSkinsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const currentLookRef = useRef({ x: 0, y: 0 });
  const targetLookRef = useRef({ x: 0, y: 0 });
  const previewRef = useRef<ISkinData | null>(null);
  const requestIdRef = useRef(0);

  const { t } = useTranslation();

  const isVisible = useMemo(
    () => Boolean(selectedAccount && selectedAccount.type !== "plain"),
    [selectedAccount],
  );

  const isManageableAccount = useMemo(
    () =>
      selectedAccount?.type === "microsoft" ||
      selectedAccount?.type === "discord",
    [selectedAccount?.type],
  );

  const canLoadRemoteSkin = useMemo(() => {
    return canLoadSkinPreviewForProvider(selectedAccount?.type, {
      isInternetOnline,
      isBackendOnline,
    });
  }, [isBackendOnline, isInternetOnline, selectedAccount]);

  const canOpenSkinManager = useMemo(() => {
    return canOpenSkinManagerForAccount(selectedAccount?.type, {
      isInternetOnline,
      isBackendOnline,
    });
  }, [isBackendOnline, isInternetOnline, selectedAccount]);

  const accountSkinKey = useMemo(() => {
    if (!selectedAccount || selectedAccount.type === "plain") return "";

    return [
      selectedAccount.type,
      selectedAccount.nickname,
      selectedAccount.accessToken || "",
      authData?.uuid || "",
      authData?.auth.accessToken || "",
    ].join(":");
  }, [
    authData?.auth.accessToken,
    authData?.uuid,
    selectedAccount?.accessToken,
    selectedAccount?.nickname,
    selectedAccount?.type,
  ]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  const loadPreview = useCallback(async (silent = false) => {
    if (!selectedAccount || selectedAccount.type === "plain") {
      setPreview(null);
      return;
    }

    if (!canLoadRemoteSkin) {
      setPreview(null);
      setIsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!silent) setIsLoading(true);

    try {
      const nextPreview = await api.skin.get(
        selectedAccount.type,
        authData?.uuid || "",
        selectedAccount.nickname,
        selectedAccount.type === "microsoft"
          ? authData?.auth.accessToken
          : selectedAccount.type === "discord"
            ? selectedAccount.accessToken
          : undefined,
      );

      if (requestIdRef.current !== requestId) return;
      setPreview(nextPreview?.skin ? nextPreview : null);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setPreview(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [authData?.auth.accessToken, authData?.uuid, canLoadRemoteSkin, selectedAccount]);

  useEffect(() => {
    setPreview(null);
    viewerRef.current = null;
  }, [accountSkinKey]);

  useEffect(() => {
    if (!isVisible) {
      setPreview(null);
      return;
    }
    void loadPreview();
  }, [isVisible, loadPreview, reloadKey]);

  useEffect(() => {
    if (!isVisible) return;

    const interval = window.setInterval(() => {
      const hasPreview = !!previewRef.current?.skin;
      void loadPreview(hasPreview);
    }, preview?.skin ? BACKGROUND_SKIN_REFRESH_MS : MISSING_SKIN_RETRY_MS);

    return () => window.clearInterval(interval);
  }, [isVisible, loadPreview, preview?.skin]);

  useEffect(() => {
    if (!isVisible) {
      setIsManageSkinsOpen(false);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !isManageableAccount || !canOpenSkinManager) return;
    return schedulePreload([LazyManageSkins.preload], 2000);
  }, [canOpenSkinManager, isManageableAccount, isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const handleMouseMove = (event: MouseEvent) => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.26;
      const offsetX = event.clientX - centerX;
      const offsetY = event.clientY - centerY;

      targetLookRef.current = {
        x: clamp((offsetY / 220) * 0.34, -0.28, 0.2),
        y: clamp((offsetX / 240) * 0.72, -0.7, 0.7),
      };
    };

    const resetLook = () => {
      targetLookRef.current = { x: 0, y: 0 };
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", resetLook);
    window.addEventListener("blur", resetLook);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", resetLook);
      window.removeEventListener("blur", resetLook);
    };
  }, [isVisible]);

  useEffect(() => {
    let frameId = 0;

    const animate = () => {
      const viewer = viewerRef.current;

      if (viewer) {
        const current = currentLookRef.current;
        const target = targetLookRef.current;

        current.x += (target.x - current.x) * 0.12;
        current.y += (target.y - current.y) * 0.12;

        viewer.playerObject.skin.head.rotation.x = current.x;
        viewer.playerObject.skin.head.rotation.y = current.y;
        viewer.playerObject.skin.body.rotation.y = current.y * 0.08;
        viewer.playerObject.rotation.y = BASE_PLAYER_ROTATION_Y;
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    currentLookRef.current = { x: 0, y: 0 };
    targetLookRef.current = { x: 0, y: 0 };

    if (!viewerRef.current) return;

    viewerRef.current.playerObject.skin.head.rotation.set(0, 0, 0);
    viewerRef.current.playerObject.skin.body.rotation.set(0, 0, 0);
    viewerRef.current.playerObject.rotation.set(0, BASE_PLAYER_ROTATION_Y, 0);
  }, [preview?.cape, preview?.skin]);

  const handleOpenManager = useCallback(async () => {
    if (!selectedAccount || isOpeningManager) return;

    if (!canOpenSkinManager) {
      toast.error(
        !isInternetOnline
          ? t("app.internetUnavailable")
          : t("app.backendUnavailable"),
      );
      return;
    }

    if (selectedAccount.type === "elyby") {
      await api.shell.openExternal("https://ely.by/skins");
      return;
    }

    if (!isManageableAccount || !authData) return;

    setIsOpeningManager(true);

    try {
      const freshAccount = authData
        ? (
            await ensureAccountSession({
              accounts,
              authData,
              selectedAccount,
              setAccounts,
              setSelectedAccount,
            })
          ).account
        : selectedAccount;
      if (!freshAccount) throw new Error("Account is unavailable");

      setIsManageSkinsOpen(true);
    } catch (err) {
      toast.error(
        t(
          isAccountSessionRefreshError(err)
            ? "accounts.sessionExpired"
            : "manageSkins.openError",
        ),
      );
    } finally {
      setIsOpeningManager(false);
    }
  }, [
    accounts,
    authData,
    canOpenSkinManager,
    isManageableAccount,
    isOpeningManager,
    isInternetOnline,
    selectedAccount,
    setAccounts,
    setSelectedAccount,
    t,
  ]);

  const handleKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.stopPropagation();
      event.preventDefault();
      await handleOpenManager();
    },
    [handleOpenManager],
  );

  if (!isVisible || !selectedAccount) return null;

  const hasNoSkin = canLoadRemoteSkin && !isLoading && !preview?.skin;

  return (
    <>
      <button
        ref={triggerRef}
        data-account-click-ignore="true"
        type="button"
        aria-label={t("manageSkins.title")}
        title={hasNoSkin ? t("manageSkins.noSkinSet") : t("manageSkins.title")}
        className={`relative -ml-1 flex h-[36px] w-[22px] flex-shrink-0 items-center justify-center overflow-hidden bg-transparent p-0 transition duration-200 ${
          isLoading || isOpeningManager
            ? "cursor-progress opacity-60"
            : "cursor-pointer opacity-100 hover:scale-105"
        } focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300/70`}
        onClick={(event) => {
          event.stopPropagation();
          void handleOpenManager();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onMouseEnter={() => preload(LazyManageSkins.preload)}
        onFocus={() => preload(LazyManageSkins.preload)}
        onKeyDown={handleKeyDown}
      >
        {preview?.skin ? (
          <Suspense
            fallback={
              <div className="flex h-[36px] w-[22px] items-center justify-center">
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ReactSkinview3d
              key={`${preview.skin}-${preview.cape || ""}`}
              className="h-[36px] w-[22px]"
              skinUrl={preview.skin}
              capeUrl={preview.cape}
              width={56}
              height={96}
              options={{
                enableControls: false,
                zoom: 0.52,
                fov: 80,
              }}
              onReady={({ viewer }) => {
                viewerRef.current = viewer;
                viewer.controls.enabled = false;
                viewer.autoRotate = false;
                viewer.nameTag = null;
                viewer.camera.position.set(18, 22, 44);
                viewer.camera.lookAt(0, 18, 0);
                viewer.playerObject.rotation.set(0, BASE_PLAYER_ROTATION_Y, 0);
              }}
            />
          </Suspense>
        ) : hasNoSkin ? (
          <div className="flex h-[32px] w-[20px] items-center justify-center rounded-md border border-dashed border-primary/60 bg-muted/40 text-primary/70">
            <Shirt className="size-3" />
          </div>
        ) : (
          <div className="flex h-[32px] w-[20px] items-center justify-center rounded-md border bg-muted/60 text-[10px] font-semibold text-muted-foreground">
            {isLoading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              selectedAccount.nickname.slice(0, 1).toUpperCase()
            )}
          </div>
        )}
      </button>

      {isManageableAccount && isManageSkinsOpen && (
        <Suspense fallback={<LazyDialogFallback variant="workspace" />}>
          <LazyManageSkins
            onClose={() => {
              setIsManageSkinsOpen(false);
              setReloadKey((value) => value + 1);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
