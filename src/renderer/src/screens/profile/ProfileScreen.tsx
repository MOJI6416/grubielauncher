import { Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { authDataAtom } from "@renderer/stores/atoms";
import { goBack, navigate } from "@renderer/navigation/navigate";
import { parseProfileSection } from "@renderer/features/profile/sections";
import {
  OWN_PROFILE_ID,
  isProfileUnavailableError,
  loadProfileUser,
} from "@renderer/features/profile/loadProfileUser";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";

const loadAccountInfo = () =>
  import("@renderer/components/Account/AccountInfo");

const LazyAccountInfo = lazyWithPreload(loadAccountInfo);

function ProfilePlaceholder() {
  return (
    <div aria-busy className="flex h-full gap-4">
      <div className="flex w-72 shrink-0 flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-32 shrink-0 rounded" />
        <Skeleton className="h-2.5 w-20 shrink-0 rounded" />
        <Skeleton className="mt-2 h-9 w-full shrink-0 rounded-lg" />
        <Skeleton className="min-h-0 w-full flex-1 rounded-lg" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-9 w-64 shrink-0 rounded-lg" />
        <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
      </div>
    </div>
  );
}

export function ProfileScreen({
  userId,
  tab,
}: {
  userId: string;
  tab?: string;
}) {
  const authData = useAtomValue(authDataAtom);
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const viewerId = authData?.sub ?? null;
  const profileKey = ["profile", userId, viewerId];

  const profile = useQuery({
    queryKey: profileKey,
    queryFn: () => loadProfileUser(userId),
  });

  if (profile.isPending) return <ProfilePlaceholder />;

  if (profile.isError || !profile.data) {
    const unavailable = isProfileUnavailableError(profile.error);

    return (
      <Empty className="h-full border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserRound />
          </EmptyMedia>
          <EmptyTitle>
            {unavailable ? t("accountInfo.unavailable") : t("accountInfo.error")}
          </EmptyTitle>
          <EmptyDescription>
            {t("accountInfo.unavailableHint")}
          </EmptyDescription>
        </EmptyHeader>
        <div className="mt-1 flex items-center gap-2">
          <Button variant="secondary" onClick={() => goBack()}>
            {t("common.close")}
          </Button>
          <Button variant="outline" onClick={() => void profile.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </Empty>
    );
  }

  return (
    <Suspense fallback={<ProfilePlaceholder />}>
      <LazyAccountInfo
        key={`${userId}:${viewerId ?? ""}`}
        user={profile.data}
        isOwner={userId === OWN_PROFILE_ID || viewerId === userId}
        section={parseProfileSection(tab)}
        onUserSynced={(next) => {
          queryClient.setQueryData(profileKey, next);
          void queryClient.invalidateQueries({
            queryKey: ["profile", "global-leaderboard"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["profile", "own-rank"],
          });
        }}
        onSectionChange={(next) =>
          navigate(
            next
              ? { name: "profile", userId, tab: next }
              : { name: "profile", userId },
            next ? {} : { replace: true },
          )
        }
      />
    </Suspense>
  );
}
