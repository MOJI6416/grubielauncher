import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { CloudOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { IUser } from "@/types/IUser";
import { LITTLESKIN_CLOSET_URL } from "@/shared/config";
import { ISkinData } from "@/types/Skin";
import {
  accountAtom,
  authDataAtom,
  internetAtom,
  networkAtom,
  pendingSkinDeepLinkAtom,
} from "@renderer/stores/atoms";
import {
  canLoadSkinPreviewForProvider,
  canOpenSkinManagerForAccount,
} from "@renderer/utilities/connectivity";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import { LazyDialogFallback } from "../LazyDialogFallback";
import { ProfileIdentityRail } from "@renderer/features/profile/ProfileIdentityRail";
import { ProfileOverview } from "@renderer/features/profile/ProfileOverview";
import {
  ProfileAchievements,
  useAchievementRows,
  useSyncUnlocked,
} from "@renderer/features/profile/ProfileAchievements";
import { ProfileLeaderboard } from "@renderer/features/profile/ProfileLeaderboard";
import { ProfileModpacks } from "@renderer/features/profile/ProfileModpacks";
import { ProfilePublicModpacks } from "@renderer/features/profile/ProfilePublicModpacks";
import {
  profileModpacks,
  profileRank,
} from "@renderer/features/profile/publicProfile";
import { ownAchievementTotals } from "@renderer/features/profile/achievementRows";
import { pointsForAchievements } from "@renderer/utilities/achievements";
import {
  isPublicProfileHiddenError,
  useAchievementReach,
  usePublicProfile,
  useWorldStats,
} from "@renderer/features/profile/useProfileData";
import {
  ProfileSection,
  resolveProfileSection,
} from "@renderer/features/profile/sections";

const api = window.api;

const loadSkinView = () =>
  import("../SkinView").then((module) => ({ default: module.SkinView }));
const loadManageSkins = () =>
  import("../ManageSkins").then((module) => ({ default: module.ManageSkins }));

const LazySkinView = lazyWithPreload(loadSkinView);
const LazyManageSkins = lazyWithPreload(loadManageSkins);

const OWNER_TABS: ProfileSection[] = [
  null,
  "achievements",
  "leaderboard",
  "modpacks",
  "skins",
];
const GUEST_TABS: ProfileSection[] = [null, "modpacks"];

const TAB_LABEL: Record<string, string> = {
  overview: "profile.tabs.overview",
  achievements: "profile.tabs.achievements",
  leaderboard: "profile.tabs.leaderboard",
  modpacks: "profile.tabs.modpacks",
  skins: "profile.tabs.skins",
};

export default function AccountInfo({
  user,
  isOwner,
  section = null,
  onSectionChange,
  onUserSynced,
}: {
  user: IUser;
  isOwner: boolean;
  section?: ProfileSection;
  onSectionChange?: (section: ProfileSection) => void;
  onUserSynced?: (user: IUser) => void;
}) {
  const { t } = useTranslation();

  const localAccount = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const pendingSkinDeepLink = useAtomValue(pendingSkinDeepLinkAtom);

  const [localSection, setLocalSection] = useState<ProfileSection>(null);
  const activeSection = resolveProfileSection(
    onSectionChange ? section : localSection,
    isOwner,
  );

  const [skinData, setSkinData] = useState<ISkinData>({ skin: "steve" });
  const [isSkinOpen, setSkinOpen] = useState(false);
  const [isSkinBusy, setSkinBusy] = useState(false);

  useEffect(() => {
    return schedulePreload(
      [LazySkinView.preload, LazyManageSkins.preload],
      1000,
    );
  }, []);

  const openSection = useCallback(
    (next: ProfileSection) => {
      if (onSectionChange) {
        onSectionChange(next);
        return;
      }
      setLocalSection(next);
    },
    [onSectionChange],
  );

  const isOwnerLocal = useMemo(
    () => Boolean(isOwner && localAccount?.nickname === user.nickname),
    [isOwner, localAccount?.nickname, user.nickname],
  );

  const canUseSkinPreview = useMemo(
    () =>
      canLoadSkinPreviewForProvider(user.platform, {
        isInternetOnline,
        isBackendOnline,
      }),
    [isBackendOnline, isInternetOnline, user.platform],
  );

  const canManageSkins = useMemo(
    () =>
      canOpenSkinManagerForAccount(user.platform, {
        isInternetOnline,
        isBackendOnline,
      }),
    [isBackendOnline, isInternetOnline, user.platform],
  );

  const worldStats = useWorldStats(isOwner);
  const publicProfile = usePublicProfile(
    isOwner ? null : user.nickname,
    isOwner ? null : user._id,
  );
  const publicPacks = useMemo(
    () => profileModpacks(publicProfile.data, user._id),
    [publicProfile.data, user._id],
  );
  const rank = useMemo(
    () => profileRank(publicProfile.data, user._id),
    [publicProfile.data, user._id],
  );
  const reach = useAchievementReach();
  const rows = useAchievementRows(
    user,
    isOwner ? worldStats.data?.stats : undefined,
    reach.data?.percentById ?? null,
  );

  const ownTotals = useMemo(
    () =>
      ownAchievementTotals(
        user.achievementPoints,
        user.achievements ?? [],
        isOwner ? rows : [],
        pointsForAchievements,
      ),
    [isOwner, rows, user.achievementPoints, user.achievements],
  );

  const isWorldStatsLoading = isOwner && worldStats.isPending;
  const hasWorldStatsFailed = isOwner && worldStats.isError;
  const isWorldStatsPartial = isOwner && worldStats.data?.partial === true;

  useSyncUnlocked(
    user,
    ownTotals.catalogIds,
    isOwner && isBackendOnline && worldStats.isSuccess,
    onUserSynced,
  );

  useEffect(() => {
    if (!pendingSkinDeepLink || !isOwner || !canManageSkins) return;
    if (user.platform !== "microsoft" && user.platform !== "discord") return;
    openSection("skins");
  }, [pendingSkinDeepLink, isOwner, canManageSkins, user.platform]);

  const handleShowSkin = useCallback(async () => {
    if (isSkinBusy) return;

    if (!canUseSkinPreview) {
      toast.error(
        user.platform === "discord"
          ? t("app.backendUnavailable")
          : t("app.internetUnavailable"),
      );
      return;
    }

    setSkinBusy(true);
    try {
      const data = await api.skin.get(
        user.platform,
        user.uuid,
        user.nickname,
        user.platform === "microsoft"
          ? isOwnerLocal
            ? authData?.auth?.accessToken
            : undefined
          : localAccount?.accessToken,
      );

      if (!data) {
        showFailureToast(t("skinView.error"), undefined, {
          channels: ["skins:"],
        });
        return;
      }

      setSkinData(data);
      setSkinOpen(true);
    } finally {
      setSkinBusy(false);
    }
  }, [
    authData?.auth?.accessToken,
    canUseSkinPreview,
    isOwnerLocal,
    isSkinBusy,
    localAccount?.accessToken,
    t,
    user.nickname,
    user.platform,
    user.uuid,
  ]);

  const isPublicPacksPending =
    publicProfile.isPending && publicProfile.fetchStatus !== "idle";
  const tabs = isOwner
    ? OWNER_TABS
    : publicPacks.length > 0 || publicProfile.isError
      ? GUEST_TABS
      : [null];
  const visibleSection = tabs.includes(activeSection) ? activeSection : null;
  const unlockedCount = rows.filter((row) => row.unlocked).length;

  return (
    <>
      <div className="flex h-full min-h-0 gap-4">
        {visibleSection === "skins" ? null : (
          <ProfileIdentityRail
            user={user}
            isOwner={isOwner}
            unlockedCount={unlockedCount}
            totalCount={rows.length}
            points={isOwner ? ownTotals.points : undefined}
            rank={rank}
            onShowSkin={handleShowSkin}
            isSkinBusy={isSkinBusy}
            canShowSkin={canUseSkinPreview}
            accessToken={localAccount?.accessToken}
            isProfileHidden={
              !isOwner && isPublicProfileHiddenError(publicProfile.error)
            }
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {tabs.length > 1 && (
            <Tabs
              value={visibleSection ?? "overview"}
              onValueChange={(value) =>
                openSection(
                  value === "overview" ? null : (value as ProfileSection),
                )
              }
              className="shrink-0 gap-0 border-b border-border"
            >
              <TabsList
                variant="line"
                aria-label={t("shell.nav.profile")}
                className="h-9 gap-0 p-0"
              >
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab ?? "overview"}
                    value={tab ?? "overview"}
                  >
                    {t(TAB_LABEL[tab ?? "overview"])}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="min-h-0 flex-1">
            {visibleSection === "skins" ? (
              canManageSkins ? (
                <Suspense fallback={<SectionLoader />}>
                  <LazyManageSkins />
                </Suspense>
              ) : (
                <SectionNotice
                  text={
                    user.platform === "elyby" || user.platform === "littleskin"
                      ? t("app.internetUnavailable")
                      : t("app.backendUnavailable")
                  }
                  action={
                    user.platform === "elyby" ||
                    user.platform === "littleskin" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void api.shell.openExternal(
                            user.platform === "littleskin"
                              ? LITTLESKIN_CLOSET_URL
                              : "https://ely.by/skins",
                          )
                        }
                      >
                        <ExternalLink />
                        {t("manageSkins.title")}
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : visibleSection === "achievements" ? (
              <ProfileAchievements
                rows={rows}
                isOwner={isOwner}
                isLoading={isWorldStatsLoading}
                statsFailed={hasWorldStatsFailed}
                statsPartial={isWorldStatsPartial}
                onRetryStats={() => void worldStats.refetch()}
                totalPlayers={reach.data?.totalUsers ?? null}
              />
            ) : visibleSection === "leaderboard" ? (
              <ProfileLeaderboard
                user={user}
                points={ownTotals.points}
                achievementIds={ownTotals.catalogIds}
              />
            ) : visibleSection === "modpacks" ? (
              isOwner ? (
                <ProfileModpacks user={user} />
              ) : (
                <ProfilePublicModpacks
                  nickname={user.nickname}
                  packs={publicPacks}
                  isLoading={isPublicPacksPending}
                  isError={publicProfile.isError || !publicProfile.data}
                  isHidden={isPublicProfileHiddenError(publicProfile.error)}
                  onRetry={() => void publicProfile.refetch()}
                />
              )
            ) : (
              <ProfileOverview
                rows={rows}
                isOwner={isOwner}
                worldStats={isOwner ? worldStats.data?.stats : undefined}
                isWorldLoading={isWorldStatsLoading}
                worldStatsFailed={hasWorldStatsFailed}
                worldStatsPartial={isWorldStatsPartial}
                onRetryWorldStats={() => void worldStats.refetch()}
                onOpenAchievements={() => openSection("achievements")}
              />
            )}
          </div>
        </div>
      </div>

      {isSkinOpen && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazySkinView
            skinData={skinData}
            nickname={user.nickname}
            onClose={() => setSkinOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

function SectionLoader() {
  return (
    <ListSkeleton
      rows={6}
      rowClassName="h-16"
      iconClassName="size-12 rounded-lg"
      className="h-full"
    />
  );
}

function SectionNotice({
  text,
  action,
}: {
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="h-full rounded-xl border border-border px-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CloudOff />
        </EmptyMedia>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
