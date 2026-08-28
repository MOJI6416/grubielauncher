import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { internetAtom, networkAtom } from "@renderer/stores/atoms";
import { forgetServerStatuses } from "@renderer/features/servers/useServerStatuses";
import { watchApiBase } from "@renderer/utilities/apiBase";
import { connectOnlineSocket } from "@renderer/utilities/onlineSocket";
import { useApiBase } from "../useApiBase";

const api = window.api;
const HEALTH_POLL_MS = 30000;
const HEALTH_RETRY_MS = 3000;
const HEALTH_FAILURES_TO_REPORT = 2;

export function ConnectivityHost() {
  const apiBase = useApiBase();
  const setIsInternetOnline = useSetAtom(internetAtom);
  const setIsBackendOnline = useSetAtom(networkAtom);

  useEffect(() => {
    const updateInternetStatus = () => {
      setIsInternetOnline(window.navigator.onLine);
    };

    const handleOnline = () => {
      forgetServerStatuses();
      updateInternetStatus();
    };

    updateInternetStatus();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", updateInternetStatus);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", updateInternetStatus);
    };
  }, [setIsInternetOnline]);

  useEffect(() => watchApiBase(), []);

  useEffect(() => connectOnlineSocket(apiBase), [apiBase]);

  useEffect(() => {
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (cancelled) return;

      const healthy = await api.backend.checkHealth();
      if (cancelled) return;

      if (healthy) {
        failures = 0;
        setIsBackendOnline(true);
        schedule(HEALTH_POLL_MS);
        return;
      }

      failures += 1;
      if (failures >= HEALTH_FAILURES_TO_REPORT) setIsBackendOnline(false);
      schedule(
        failures >= HEALTH_FAILURES_TO_REPORT
          ? HEALTH_POLL_MS
          : HEALTH_RETRY_MS,
      );
    };

    const handleOnline = () => {
      failures = 0;
      void poll();
    };

    const handleOffline = () => {
      failures = HEALTH_FAILURES_TO_REPORT;
      setIsBackendOnline(false);
      schedule(HEALTH_RETRY_MS);
    };

    void poll();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setIsBackendOnline]);

  return null;
}
