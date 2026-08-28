import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IUser } from "@/types/IUser";
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
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {tabs.length > 1 && (
            <nav className="flex h-9 shrink-0 items-center gap-0.5 self-start rounded-lg bg-surface-1 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab ?? "overview"}
                  type="button"
                  aria-pressed={visibleSection === tab}
                  onClick={() => openSection(tab)}
                  className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground"
                >
                  {t(TAB_LABEL[tab ?? "overview"])}
                </button>
              ))}
            </nav>
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
                    user.platform === "elyby"
                      ? t("app.internetUnavailable")
                      : t("app.backendUnavailable")
                  }
                  action={
                    user.platform === "elyby" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void api.shell.openExternal("https://ely.by/skins")
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
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
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
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
