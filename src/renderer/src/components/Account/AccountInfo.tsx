import { IUser } from "@/types/IUser";
import { useTranslation } from "react-i18next";
import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { TbSquareLetterE } from "react-icons/tb";
import {
  Award,
  Boxes,
  Calendar,
  Clock,
  Loader2,
  Save,
  Settings2,
  Shirt,
  Users,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  internetAtom,
  networkAtom,
  pathsAtom,
} from "@renderer/stores/atoms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ILocalAccount } from "@/types/Account";
import { ISkinData } from "@/types/Skin";
import pt100 from "@renderer/assets/achievements/pt100.png";
import pt500 from "@renderer/assets/achievements/pt500.png";
import pt1000 from "@renderer/assets/achievements/pt1000.png";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { formatDate, formatTime } from "@renderer/utilities/date";
import axios from "axios";
import { IModpack } from "@/types/Backend";
import { ensureAccountSession } from "@renderer/utilities/accountSession";
import { toast } from "sonner";
import { LazyDialogFallback } from "../LazyDialogFallback";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import {
  canLoadSkinPreviewForProvider,
  canOpenSkinManagerForAccount,
} from "@renderer/utilities/connectivity";

const api = window.api;

const loadSkinView = () =>
  import("../SkinView").then((module) => ({ default: module.SkinView }));
const loadImageCropper = () =>
  import("../ImageCropper").then((module) => ({
    default: module.ImageCropper,
  }));
const loadManageSkins = () =>
  import("../ManageSkins").then((module) => ({ default: module.ManageSkins }));
const loadAchievements = () =>
  import("./Achievements").then((module) => ({ default: module.Achievements }));
const loadOwnModpacks = () =>
  import("./OwnModpacks").then((module) => ({ default: module.OwnModpacks }));

const LazySkinView = lazyWithPreload(loadSkinView);
const LazyImageCropper = lazyWithPreload(loadImageCropper);
const LazyManageSkins = lazyWithPreload(loadManageSkins);
const LazyAchievements = lazyWithPreload(loadAchievements);
const LazyOwnModpacks = lazyWithPreload(loadOwnModpacks);

type LoadingType = "skin" | "save" | "manageSkins" | "ownModpacks" | null;

const ACH_ICON: Record<string, string> = {
  pt100,
  pt500,
  pt1000,
};

function ProviderIcon({ platform }: { platform: IUser["platform"] }) {
  if (platform === "microsoft") return <FaMicrosoft className="size-4" />;
  if (platform === "elyby") return <TbSquareLetterE className="size-4" />;
  if (platform === "discord") return <FaDiscord className="size-4" />;
  return null;
}

export default function AccountInfo({
  onClose,
  user,
  isOwner,
}: {
  onClose: () => void;
  user: IUser;
  isOwner: boolean;
}) {
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<LoadingType>(null);

  const [skinData, setSkinData] = useState<ISkinData>({ skin: "steve" });
  const [skinModal, setSkinModal] = useState(false);

  const [croppedImage, setCroppedImage] = useState<string>("");
  const [isCropping, setIsCropping] = useState(false);

  const [image, setImage] = useState<string | null>(user.image ?? null);
  const [isAvatarDirty, setIsAvatarDirty] = useState(false);

  const [localAccount, setLocalAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [paths] = useAtom(pathsAtom);
  const [authData] = useAtom(authDataAtom);
  const [isInternetOnline] = useAtom(internetAtom);
  const [isBackendOnline] = useAtom(networkAtom);

  const [isManageSkins, setIsManageSkins] = useState(false);
  const [isAchievements, setIsAchievements] = useState(false);

  const [isOwnModpacks, setIsOwnModpacks] = useState(false);
  const [ownModpacks, setOwnModpacks] = useState<IModpack[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return schedulePreload(
      [
        LazySkinView.preload,
        LazyImageCropper.preload,
        LazyManageSkins.preload,
        LazyAchievements.preload,
        LazyOwnModpacks.preload,
      ],
      1000,
    );
  }, []);

  const userKey = `${user._id}_${user.nickname}_${user.platform}`;
  useEffect(() => {
    setImage(user.image ?? null);
    setIsAvatarDirty(false);
  }, [userKey]);

  const autoplay = useMemo(
    () =>
      Autoplay({
        delay: 2500,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    [],
  );
  const [emblaRef] = useEmblaCarousel(
    { loop: false, dragFree: true, align: "start" },
    [autoplay],
  );

  const startLoading = useCallback((type: Exclude<LoadingType, null>) => {
    setIsLoading(true);
    setLoadingType(type);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
    setLoadingType(null);
  }, []);

  const isOwnerLocal = useMemo(() => {
    return Boolean(isOwner && localAccount?.nickname === user.nickname);
  }, [isOwner, localAccount?.nickname, user.nickname]);

  const canSave = useMemo(() => {
    if (!isOwner) return false;
    if (!localAccount) return false;
    if (!image) return false;
    if (!isAvatarDirty) return false;
    if (isLoading) return false;
    if (!isBackendOnline) return false;
    return true;
  }, [isOwner, localAccount, image, isAvatarDirty, isLoading, isBackendOnline]);

  const canUseSkinPreview = useMemo(() => {
    return canLoadSkinPreviewForProvider(user.platform, {
      isInternetOnline,
      isBackendOnline,
    });
  }, [isBackendOnline, isInternetOnline, user.platform]);

  const canManageSkins = useMemo(() => {
    return canOpenSkinManagerForAccount(user.platform, {
      isInternetOnline,
      isBackendOnline,
    });
  }, [isBackendOnline, isInternetOnline, user.platform]);

  const handleChooseAvatar = useCallback(async () => {
    if (!isOwner || isLoading) return;

    const filePaths = await api.other.openFileDialog();
    if (!filePaths || filePaths.length === 0) return;

    setCroppedImage(filePaths[0]);
    setIsCropping(true);
  }, [isOwner, isLoading]);

  const handleSaveAvatar = useCallback(async () => {
    if (!canSave || !localAccount || !image) return;

    startLoading("save");
    try {
      let accountForRequest = localAccount;
      let accountsForSave = accounts;
      if (authData && localAccount.type !== "plain") {
        const refreshed = await ensureAccountSession({
          accounts,
          authData,
          selectedAccount: localAccount,
          setAccounts,
          setSelectedAccount: setLocalAccount,
        });

        accountForRequest = refreshed.account;
        accountsForSave = refreshed.accounts;
      }

      const fileName = `${user._id}.png`;
      const tmpDir = await api.other.getPath("temp");
      const tmpPath = await api.path.join(tmpDir, fileName);

      const response = await axios.get<ArrayBuffer>(image, {
        responseType: "arraybuffer",
      });

      const bytes = new Uint8Array(response.data);

      await api.fs.writeFile(tmpPath, bytes);

      const url = await api.backend.uploadFileFromPath(
        accountForRequest.accessToken || "",
        tmpPath,
        undefined,
        "avatars",
      );

      await api.fs.rimraf(tmpPath);

      if (!url) throw new Error("Upload failed");

      if (accountForRequest.accessToken) {
        const updatedUser = await api.backend.updateUser(accountForRequest.accessToken, user._id, {
          image: url,
        });
        if (!updatedUser) throw new Error("User update failed");
      }

      const updatedLocalAccount = { ...accountForRequest, image: url };
      const updatedAccounts = accountsForSave.map((a: ILocalAccount) =>
        a.nickname === accountForRequest.nickname && a.type === accountForRequest.type
          ? { ...a, image: url }
          : a,
      );

      setLocalAccount(updatedLocalAccount);
      setAccounts(updatedAccounts);

      await api.accounts.save(
        updatedAccounts,
        `${updatedLocalAccount.type}_${updatedLocalAccount.nickname}`,
      );

      setImage(url);
      setIsAvatarDirty(false);

      toast.success(t("accountInfo.updated"));
    } catch (err) {
      console.error(err);

      toast.error(t("accountInfo.updateError"));
    } finally {
      stopLoading();
    }
  }, [
    canSave,
    localAccount,
    image,
    user._id,
    accounts,
    authData,
    paths.launcher,
    setAccounts,
    setLocalAccount,
    t,
    startLoading,
    stopLoading,
  ]);

  const handleOpenSkin = useCallback(async () => {
    if (isLoading) return;

    if (!canUseSkinPreview) {
      toast.error(
        user.platform === "discord"
          ? t("app.backendUnavailable")
          : t("app.internetUnavailable"),
      );
      return;
    }

    startLoading("skin");
    try {
      const data = await api.skin.get(
        user.platform,
        user.uuid,
        user.nickname,
        user.platform === "microsoft"
          ? isOwnerLocal
            ? authData?.auth.accessToken
            : undefined
          : localAccount?.accessToken,
      );

      if (!data) {
        toast.error(t("skinView.error"));
        return;
      }

      setSkinData(data);
      setSkinModal(true);
    } finally {
      stopLoading();
    }
  }, [
    isLoading,
    user.platform,
    user.uuid,
    user.nickname,
    localAccount?.accessToken,
    authData?.auth.accessToken,
    isOwnerLocal,
    canUseSkinPreview,
    t,
    startLoading,
    stopLoading,
  ]);

  const handleManageSkins = useCallback(async () => {
    if (isLoading) return;

    if (!canManageSkins) {
      toast.error(
        !isInternetOnline
          ? t("app.internetUnavailable")
          : user.platform === "discord" || user.platform === "microsoft"
          ? t("app.backendUnavailable")
          : t("accountInfo.error"),
      );
      return;
    }

    if (user.platform === "elyby") {
      await api.shell.openExternal("https://ely.by/skins");
      return;
    }

    if (!authData || !localAccount || !localAccount.accessToken) return;

    startLoading("manageSkins");
    try {
      await ensureAccountSession({
        accounts,
        authData,
        selectedAccount: localAccount,
        setAccounts,
        setSelectedAccount: setLocalAccount,
      });

      setIsManageSkins(true);
    } catch {
      toast.error(t("manageSkins.openError"));
    } finally {
      stopLoading();
    }
  }, [
    isLoading,
    user.platform,
    authData,
    localAccount,
    accounts,
    canManageSkins,
    isInternetOnline,
    setAccounts,
    setLocalAccount,
    t,
    startLoading,
    stopLoading,
  ]);

  const handleSkinScreenshot = useCallback((dataUrl: string) => {
    setCroppedImage(dataUrl);
    setIsCropping(true);
    setSkinModal(false);
  }, []);

  const handleAvatarChange = useCallback((value: string | null) => {
    setImage(value);
    setIsAvatarDirty(true);
  }, []);

  const handleOwnModpacks = useCallback(async () => {
    if (isLoading) return;

    if (!isBackendOnline) {
      toast.error(t("app.backendUnavailable"));
      return;
    }

    if (!authData || !localAccount || !localAccount.accessToken) return;

    startLoading("ownModpacks");
    try {
      const modpacks = await api.backend.getOwnModpacks(
        localAccount.accessToken,
      );

      if (modpacks.length === 0) {
        toast(t("ownModpacks.noModpacks"));
        return;
      }

      setOwnModpacks(modpacks);
      setIsOwnModpacks(true);
    } catch {
    } finally {
      stopLoading();
    }
  }, [
    isLoading,
    isBackendOnline,
    authData,
    localAccount,
    t,
    startLoading,
    stopLoading,
  ]);

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isLoading) onClose();
        }}
      >
        <DialogContent
          className="sm:max-w-2xl"
          onPointerDownOutside={(event) => {
            if (isLoading) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isLoading) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("accountInfo.title")}</DialogTitle>
          </DialogHeader>

          <TooltipProvider>
            <div className="grid gap-5">
              <div className="grid min-w-0 gap-4 rounded-xl border bg-muted/25 p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <button
                  type="button"
                  className="group relative size-20 shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
                  disabled={!isOwner || isLoading}
                  onMouseEnter={() => preload(LazyImageCropper.preload)}
                  onFocus={() => preload(LazyImageCropper.preload)}
                  onClick={handleChooseAvatar}
                  aria-label={t("accountInfo.changeAvatar")}
                >
                  <Avatar size="lg" className="h-20 w-20 border shadow-sm">
                    <AvatarImage src={image ?? ""} alt={user.nickname} />
                    <AvatarFallback className="text-lg">
                      {user.nickname.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isOwner && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {t("common.edit")}
                    </span>
                  )}
                </button>

                <div className="flex min-w-0 flex-col justify-center gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-2xl font-semibold leading-tight">
                        {user.nickname}
                      </h2>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-card-foreground shadow-xs"
                            aria-label={user.platform}
                          >
                            <ProviderIcon platform={user.platform} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="capitalize">
                          {user.platform}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1.25fr_0.8fr_1fr]">
                    <Card className="gap-0 py-0">
                      <CardContent className="flex min-w-0 items-center gap-2 p-3">
                        <Calendar className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">
                            {t("accountInfo.registered")}
                          </p>
                          <p
                            className="truncate text-xs font-medium tabular-nums"
                            title={formatDate(new Date(user.createdAt))}
                          >
                            {formatDate(new Date(user.createdAt))}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="gap-0 py-0">
                      <CardContent className="flex items-center gap-2 p-3">
                        <Users className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">
                            {t("accountInfo.friends")}
                          </p>
                          <p className="truncate text-sm font-medium">
                            {user.friends.length}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="gap-0 py-0">
                      <CardContent className="flex items-center gap-2 p-3">
                        <Clock className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">
                            {t("accountInfo.playTime")}
                          </p>
                          <p className="truncate text-sm font-medium">
                            {formatTime(user.playTime, {
                              h: t("time.h"),
                              m: t("time.m"),
                              s: t("time.s"),
                            })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              {(user.achievements.length > 0 || isOwner) && (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Award className="size-4 shrink-0 text-muted-foreground" />
                      <p className="truncate text-sm font-medium">
                        {t("achievements.title")}
                      </p>
                    </div>
                    {isOwner && (
                  <Button
                    variant="secondary"
                    disabled={isLoading}
                    onMouseEnter={() => preload(LazyAchievements.preload)}
                    onFocus={() => preload(LazyAchievements.preload)}
                    onClick={() => setIsAchievements(true)}
                    size="sm"
                      >
                        <Award className="size-4" />
                        {t("achievements.showAll")}
                      </Button>
                    )}
                  </div>

                  {user.achievements.length > 0 ? (
                    <div
                      className="overflow-hidden rounded-xl border bg-muted/20 p-3"
                      ref={emblaRef}
                    >
                      <div className="-ml-2 flex">
                        {user.achievements.map((achievement, i) => {
                          const src = ACH_ICON[achievement] ?? "";
                          if (!src) return null;

                          return (
                            <div
                              className="min-w-0 flex-[0_0_4.5rem] pl-2 select-none"
                              key={`${achievement}-${i}`}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex size-16 items-center justify-center rounded-lg border bg-card p-2 shadow-xs">
                                    <img
                                      className="max-h-full max-w-full object-contain"
                                      draggable={false}
                                      src={src}
                                      alt={t(`achievements.${achievement}`)}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t(`achievements.${achievement}`)}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                      {t("achievements.noAchievements")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TooltipProvider>

          <DialogFooter>
            <div className="flex w-full flex-col gap-3">
              <div
                className={
                  isOwner ? "grid gap-2 sm:grid-cols-3" : "flex flex-wrap gap-2"
                }
              >
                <Button
                  variant="secondary"
                  disabled={isLoading || !canUseSkinPreview}
                  onMouseEnter={() => preload(LazySkinView.preload)}
                  onFocus={() => preload(LazySkinView.preload)}
                  onClick={handleOpenSkin}
                >
                  {isLoading && loadingType === "skin" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Shirt className="size-4 flex-shrink-0" />
                  )}
                  {t("skinView.title")}
                </Button>

                {isOwner && (
                  <Button
                    disabled={isLoading || !canManageSkins}
                    variant="secondary"
                    onMouseEnter={() => preload(LazyManageSkins.preload)}
                    onFocus={() => preload(LazyManageSkins.preload)}
                    onClick={handleManageSkins}
                  >
                    {isLoading && loadingType === "manageSkins" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Settings2 className="size-4 flex-shrink-0" />
                    )}
                    {t("manageSkins.title")}
                  </Button>
                )}

                {isOwner && (
                  <Button
                    disabled={
                      isLoading ||
                      localAccount?.type === "plain" ||
                      !isBackendOnline
                    }
                    variant="secondary"
                    onMouseEnter={() => preload(LazyOwnModpacks.preload)}
                    onFocus={() => preload(LazyOwnModpacks.preload)}
                    onClick={handleOwnModpacks}
                  >
                    {isLoading && loadingType === "ownModpacks" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Boxes className="size-4 flex-shrink-0" />
                    )}
                    {t("ownModpacks.title")}
                  </Button>
                )}
              </div>

              {isOwner && (
                <Button
                  className="self-end"
                  disabled={!canSave}
                  onClick={handleSaveAvatar}
                >
                  {isLoading && loadingType === "save" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4 flex-shrink-0" />
                  )}
                  {t("common.save")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isManageSkins && (
        <Suspense fallback={<LazyDialogFallback variant="workspace" />}>
          <LazyManageSkins onClose={() => setIsManageSkins(false)} />
        </Suspense>
      )}

      {skinModal && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazySkinView
            skinData={skinData}
            nickname={user.nickname}
            isOwner={isOwnerLocal}
            onClose={() => setSkinModal(false)}
            setScreenshotFile={handleSkinScreenshot}
          />
        </Suspense>
      )}

      {isCropping && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyImageCropper
            onClose={() => setIsCropping(false)}
            title={t("accountInfo.editingAvatar")}
            image={croppedImage}
            size={{ width: 128, height: 128 }}
            changeImage={handleAvatarChange}
          />
        </Suspense>
      )}

      {isAchievements && isOwner && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyAchievements
            onClose={() => setIsAchievements(false)}
            user={user}
          />
        </Suspense>
      )}

      {isOwnModpacks && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyOwnModpacks
            onClose={() => setIsOwnModpacks(false)}
            _modpacks={ownModpacks}
          />
        </Suspense>
      )}
    </>
  );
}
