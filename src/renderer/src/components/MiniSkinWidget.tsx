import { ISkinData } from "@/types/Skin";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
} from "@renderer/stores/atoms";
import { addToast } from "@heroui/react";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactSkinview3d from "react-skinview3d";
import { SkinViewer } from "skinview3d";
import { ManageSkins } from "./ManageSkins";
import { ensureAccountSession } from "@renderer/utilities/accountSession";

const api = window.api;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const BASE_PLAYER_ROTATION_Y = 0.4;

export function MiniSkinWidget() {
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [authData] = useAtom(authDataAtom);
  const [preview, setPreview] = useState<ISkinData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpeningManager, setIsOpeningManager] = useState(false);
  const [isManageSkinsOpen, setIsManageSkinsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const currentLookRef = useRef({ x: 0, y: 0 });
  const targetLookRef = useRef({ x: 0, y: 0 });

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

  const loadPreview = useCallback(async () => {
    if (!selectedAccount || selectedAccount.type === "plain") {
      setPreview(null);
      return;
    }

    setIsLoading(true);

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

      setPreview(nextPreview?.skin ? nextPreview : null);
    } catch {
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  }, [authData?.auth.accessToken, authData?.uuid, selectedAccount]);

  useEffect(() => {
    if (!isVisible) {
      setPreview(null);
      return;
    }
    void loadPreview();
  }, [isVisible, loadPreview, reloadKey]);

  useEffect(() => {
    if (!isVisible) {
      setIsManageSkinsOpen(false);
    }
  }, [isVisible]);

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
    } catch {
      addToast({ color: "danger", title: t("common.error") });
    } finally {
      setIsOpeningManager(false);
    }
  }, [
    accounts,
    authData,
    isManageableAccount,
    isOpeningManager,
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

  if (!isVisible || !selectedAccount || !preview?.skin) return null;

  return (
    <>
      <button
        ref={triggerRef}
        data-account-click-ignore="true"
        type="button"
        aria-label={t("manageSkins.title")}
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
        onKeyDown={handleKeyDown}
      >
        <ReactSkinview3d
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
      </button>

      {isManageableAccount && isManageSkinsOpen && (
        <ManageSkins
          onClose={() => {
            setIsManageSkinsOpen(false);
            setReloadKey((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
