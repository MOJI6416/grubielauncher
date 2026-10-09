import { useCallback, useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { JavaRuntimeInfo, JavaRuntimeList } from "@/shared/javaRuntime";

const api = window.api;

export const javaRuntimesAtom = atom<JavaRuntimeList | null>(null);
export const javaScanningAtom = atom(false);

let inFlight: Promise<JavaRuntimeList | null> | null = null;

export function loadJavaRuntimes(
  rescan = false,
): Promise<JavaRuntimeList | null> {
  if (inFlight && !rescan) return inFlight;

  const store = getDefaultStore();
  store.set(javaScanningAtom, true);

  const request: Promise<JavaRuntimeList | null> = api.java
    .list(rescan)
    .then((list) => {
      store.set(javaRuntimesAtom, list);
      return list;
    })
    .catch(() => null)
    .finally(() => {
      if (inFlight === request) {
        inFlight = null;
        store.set(javaScanningAtom, false);
      }
    });

  inFlight = request;
  return request;
}

function storeList(list: JavaRuntimeList | null) {
  if (list) getDefaultStore().set(javaRuntimesAtom, list);
}

export function useJavaRuntimes() {
  const { t } = useTranslation();
  const list = useAtomValue(javaRuntimesAtom);
  const scanning = useAtomValue(javaScanningAtom);

  useEffect(() => {
    if (!getDefaultStore().get(javaRuntimesAtom)) void loadJavaRuntimes();
  }, []);

  const add = useCallback(async (): Promise<JavaRuntimeInfo | null> => {
    const result = await api.java.add();
    if (result.ok) {
      storeList(result.list);
      toast.success(
        t("java.added", {
          name: [result.runtime.vendor, result.runtime.version]
            .filter(Boolean)
            .join(" "),
        }),
      );
      return result.runtime;
    }

    if (result.reason !== "cancelled") {
      toast.error(t(`java.addFailed.${result.reason}`));
    }
    return null;
  }, [t]);

  const remove = useCallback(async (home: string) => {
    storeList(await api.java.remove(home));
  }, []);

  const setDefault = useCallback(
    async (major: number, home: string | null) => {
      const next = await api.java.setDefault(major, home);
      if (next) {
        storeList(next);
        return true;
      }

      toast.error(t("java.defaultFailed"));
      void loadJavaRuntimes(true);
      return false;
    },
    [t],
  );

  const refresh = useCallback(() => loadJavaRuntimes(true), []);

  return { list, scanning, add, remove, setDefault, refresh };
}
