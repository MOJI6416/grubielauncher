import { useEffect } from "react";
import { useSetAtom } from "jotai";
import {
  applyServerRunState,
  runningServersAtom,
  serverPathKey,
} from "@renderer/features/servers/runningServers";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export function ServerRunStateHost() {
  const setRunning = useSetAtom(runningServersAtom);

  useEffect(() => {
    let active = true;
    const heard = new Set<string>();

    const off = api.server.onRunState((payload) => {
      heard.add(serverPathKey(payload.serverPath));
      setRunning((list) => applyServerRunState(list, payload));
    });

    void api.server
      .running()
      .then((list) => {
        if (!active) return;
        setRunning((current) =>
          list
            .filter((entry) => !heard.has(serverPathKey(entry.serverPath)))
            .reduce(applyServerRunState, current),
        );
      })
      .catch(ignoreFailure);

    return () => {
      active = false;
      off();
    };
  }, [setRunning]);

  return null;
}
