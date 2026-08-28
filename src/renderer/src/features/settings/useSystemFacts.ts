import { useEffect, useState } from "react";
import { toTotalMemoryMb } from "./memory";

const api = window.api;

export function useSystemFacts() {
  const [appVersion, setAppVersion] = useState("");
  const [totalMemoryMb, setTotalMemoryMb] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([api.other.getVersion(), api.os.totalmem()]).then(
      ([version, memory]) => {
        if (cancelled) return;
        setAppVersion(version);
        setTotalMemoryMb(toTotalMemoryMb(memory));
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return { appVersion, totalMemoryMb };
}
