import { useCallback, useEffect, useRef } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
} from "@renderer/stores/atoms";
import { evaluateAchievements } from "@renderer/utilities/achievements";
import { fetchMergedAchievementStats } from "@renderer/utilities/achievementStats";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "@renderer/utilities/accountSession";
import { playAchievementSound } from "@renderer/utilities/sounds";

const api = window.api;

export function AchievementsHost() {
  const { t } = useTranslation();
  const authData = useAtomValue(authDataAtom);
  const selectedAccount = useAtomValue(accountAtom);
  const inFlightRef = useRef(false);

  const flushPlaytimeSyncQueue = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const store = getDefaultStore();

    try {
      const ad = store.get(authDataAtom);
      let a = store.get(accountAtom);
      if (!ad?.sub || !a || !a.accessToken) return;

      const queue = await api.statistics.getSyncQueue();
      const mine = queue.filter((e) => e.sub === ad.sub && e.seconds > 0);
      if (mine.length === 0) return;

      if (a.type !== "plain") {
        const refreshed = await ensureAccountSession({
          accounts: store.get(accountsAtom),
          authData: ad,
          selectedAccount: a,
          setAccounts: (next) => store.set(accountsAtom, next),
          setSelectedAccount: (next) => store.set(accountAtom, next),
        });

        a = refreshed.account;
      }

      const user = await api.backend.getUser(a.accessToken || "", ad.sub);
      if (!user) return;

      const totalSeconds = mine.reduce((sum, e) => sum + e.seconds, 0);
      const newPlayTime = user.playTime + totalSeconds;

      let earnedAchievements: string[] | undefined;
      let newlyEarned: string[] = [];
      try {
        const { stats } = await fetchMergedAchievementStats(a);
        const unlocked = evaluateAchievements(
          stats,
          newPlayTime,
          user.achievements,
        )
          .filter((p) => p.unlocked)
          .map((p) => p.def.id);
        newlyEarned = unlocked.filter((id) => !user.achievements.includes(id));
        if (newlyEarned.length > 0) earnedAchievements = unlocked;
      } catch {}

      const saved = await api.backend.updateUser(a.accessToken || "", user._id, {
        playTime: newPlayTime,
        ...(earnedAchievements ? { achievements: earnedAchievements } : {}),
      });

      if (!saved) return;

      for (const id of newlyEarned) {
        toast.success(
          t("achievements.unlockedToast", {
            name: t(`achievements.items.${id}.name`),
          }),
          { icon: <Trophy className="size-4 text-primary" /> },
        );
      }
      if (newlyEarned.length > 0) playAchievementSound();

      await api.statistics.resolveSyncEntries(mine.map((e) => e.id));
    } catch (err) {
      if (!isAccountSessionRefreshError(err)) {
        console.error(err);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    void flushPlaytimeSyncQueue();
  }, [authData, selectedAccount, flushPlaytimeSyncQueue]);

  useEffect(() => {
    return api.events.onPlaytimeRecorded(() => {
      void flushPlaytimeSyncQueue();
    });
  }, [flushPlaytimeSyncQueue]);

  return null;
}
