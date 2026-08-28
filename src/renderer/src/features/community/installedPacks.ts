import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { versionsAtom } from "@renderer/stores/atoms";
import { instanceKey } from "@renderer/features/instances/selectors";

export function useInstalledShareCodes(): Map<string, string> {
  const versions = useAtomValue(versionsAtom);

  return useMemo(() => {
    const map = new Map<string, string>();

    for (const version of versions) {
      const code = version.version.shareCode;
      if (code && !map.has(code)) map.set(code, instanceKey(version));
    }

    return map;
  }, [versions]);
}
