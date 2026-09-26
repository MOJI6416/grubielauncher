import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { appUpdateAtom } from "@renderer/features/appUpdate/appUpdate";

const api = window.api;

export function AppUpdateHost() {
  const setState = useSetAtom(appUpdateAtom);

  useEffect(() => {
    let cancelled = false;
    void api.appUpdate
      .getState()
      .then((state) => {
        if (!cancelled) setState(state);
      })
      .catch(() => undefined);

    const stop = api.appUpdate.onState(setState);
    return () => {
      cancelled = true;
      stop();
    };
  }, [setState]);

  return null;
}
