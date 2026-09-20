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

export function findInstalledInstanceKey(
  installed: Map<string, string>,
  pack: { id?: string; _id?: string; shareCode?: string | null },
): string | undefined {
  for (const key of [pack.shareCode, pack.id, pack._id]) {
    if (!key) continue;

    const found = installed.get(key);
    if (found) return found;
  }

  return undefined;
}
