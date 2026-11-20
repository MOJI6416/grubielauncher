import { useCallback, useEffect, useRef } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import {
  accountAtom,
  authDataAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { planPackSessionFlush } from "@renderer/features/packAuthor/packSessions";

const api = window.api;

export function PackSessionsHost() {
  const authData = useAtomValue(authDataAtom);
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const inFlightRef = useRef(false);
  const isLoaded = settings !== DEFAULT_SETTINGS;

  const flush = useCallback(async () => {
    const store = getDefaultStore();
    const current = store.get(settingsAtom);
    if (current === DEFAULT_SETTINGS || inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const queue = await api.statistics.getPackSessionQueue();
      if (!queue.length) return;

      const signedIn = store.get(accountAtom);
      const plan = planPackSessionFlush(
        queue,
        store.get(authDataAtom)?.sub ?? null,
        current.packAnalytics,
        Date.now(),
      );
      const done = [...plan.drop];

      if (signedIn?.accessToken && signedIn.type !== "plain") {
        for (const entry of plan.send) {
          const result = await api.backend.reportModpackSession(
            signedIn.accessToken,
            entry.code,
            { build: entry.build, seconds: entry.seconds, crashed: entry.crashed },
          );
          if (result === "failed") break;
          done.push(entry.id);
        }
      }

      if (done.length) await api.statistics.resolvePackSessions(done);
    } catch {
      ignoreFailure();
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isLoaded) void flush();
  }, [authData, account, isLoaded, settings.packAnalytics, flush]);

  useEffect(() => {
    return api.events.onPlaytimeRecorded(() => {
      void flush();
    });
  }, [flush]);

  return null;
}
