import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { appUpdateAtom } from "@renderer/features/appUpdate/appUpdate";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

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
      .catch(ignoreFailure);

    const stop = api.appUpdate.onState(setState);
    return () => {
      cancelled = true;
      stop();
    };
  }, [setState]);

  return null;
}
