import { useCallback, useEffect, useState } from "react";
import type {
  ServerAdminAction,
  ServerAdminResult,
  ServerAdminSnapshot,
} from "@/types/ServerAdmin";
import { emptyServerAdminSnapshot } from "@/types/ServerAdmin";

const api = window.api;

function samePath(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export function useServerAdmin(serverPath: string, isRunning: boolean) {
  const [snapshot, setSnapshot] = useState<ServerAdminSnapshot>(() =>
    emptyServerAdminSnapshot(serverPath),
  );

  useEffect(() => {
    if (!serverPath) return;
    let cancelled = false;

    void api.server.admin.snapshot(serverPath).then((next) => {
      if (!cancelled && next) setSnapshot(next);
    });

    const off = api.server.admin.onEvent((event) => {
      if (!samePath(event.serverPath, serverPath)) return;
      setSnapshot(event.snapshot);
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [serverPath, isRunning]);

  const perform = useCallback(
    async (action: ServerAdminAction): Promise<ServerAdminResult> => {
      const result = await api.server.admin.perform(serverPath, action);
      if (result?.snapshot) setSnapshot(result.snapshot);
      return result ?? { ok: false, error: "server_admin_failed" };
    },
    [serverPath],
  );

  const refresh = useCallback(
    async (gamerules = false) => {
      const next = await api.server.admin.refresh(serverPath, gamerules);
      if (next) setSnapshot(next);
      return next;
    },
    [serverPath],
  );

  return { snapshot, perform, refresh };
}
