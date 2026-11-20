import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import {
  accountAtom,
  authDataAtom,
  networkAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import "@renderer/features/sync/accountSync";
import { scheduleAccountSync } from "@renderer/features/sync/syncSchedule";

const PERIOD_MS = 10 * 60 * 1000;
const START_DELAY_MS = 2000;

export function AccountSyncHost() {
  const settings = useAtomValue(settingsAtom);
  const account = useAtomValue(accountAtom);
  const userId = useAtomValue(authDataAtom)?.sub;
  const online = useAtomValue(networkAtom);
  const enabled = settings !== DEFAULT_SETTINGS && settings.accountSync;
  const token = account?.type === "plain" ? undefined : account?.accessToken;

  useEffect(() => {
    if (enabled && online && userId && token) scheduleAccountSync(START_DELAY_MS);
  }, [enabled, online, userId, token]);

  useEffect(() => {
    if (!enabled || !online || !userId) return;
    const timer = setInterval(() => scheduleAccountSync(0), PERIOD_MS);
    return () => clearInterval(timer);
  }, [enabled, online, userId]);

  return null;
}
