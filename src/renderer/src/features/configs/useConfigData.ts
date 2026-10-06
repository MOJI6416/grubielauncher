import { useEffect, useMemo, useRef, useState } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  ILocalProject,
  LocalModDependencyIndex,
} from "@/types/ModManager";
import { accountAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  TRANSLATION_MAX_BODIES,
  batchBodies,
  parseTranslationReply,
  translationPrompt,
} from "./comments";
import { ConfigEntry, MAX_CONFIG_BYTES } from "./configFiles";
import { ModIdentity, modIdentities } from "./modGroups";

const api = window.api;

const commentTranslationsAtom = atom<ReadonlyMap<string, string>>(new Map());
const failedTranslationsAtom = atom<ReadonlySet<string>>(new Set<string>());
const dependencyIndexes = new Map<
  string,
  Promise<LocalModDependencyIndex | null>
>();

const READ_CONCURRENCY = 8;

function cacheKey(language: string, body: string): string {
  return `${language}\u0000${body}`;
}

export function entryPath(entry: ConfigEntry): string {
  return api.path.join(entry.base, ...entry.relative.split("/"));
}

export function entryDirectory(entry: ConfigEntry): string {
  return api.path.join(entry.base, ...entry.relative.split("/").slice(0, -1));
}

export interface TranslationProgress {
  done: number;
  total: number;
}

export function useCommentTranslation(bodies: string[], isActive: boolean) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const account = useAtomValue(accountAtom);
  const cache = useAtomValue(commentTranslationsAtom);
  const failed = useAtomValue(failedTranslationsAtom);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [attempt, setAttempt] = useState(0);

  const canTranslate =
    language !== "en" && !!account && account.type !== "plain";
  const bodiesSignature = bodies.join("\u0001");

  useEffect(() => {
    if (!isActive || !canTranslate) return;

    const store = getDefaultStore();
    const known = store.get(commentTranslationsAtom);
    const rejected = store.get(failedTranslationsAtom);
    const missing = bodies
      .filter((body) => {
        const key = cacheKey(language, body);
        return !known.has(key) && !rejected.has(key);
      })
      .slice(0, TRANSLATION_MAX_BODIES);
    if (missing.length === 0) return;

    let cancelled = false;
    const token = account?.accessToken ?? "";
    const batches = batchBodies(missing);

    void (async () => {
      let failedBatches = 0;
      setProgress({ done: 0, total: batches.length });

      for (let index = 0; index < batches.length; index++) {
        if (cancelled) return;
        const batch = batches[index];
        const reply = await api.backend
          .aiComplete(token, translationPrompt(batch, language))
          .catch(() => null);
        const parsed = parseTranslationReply(reply, batch.length);

        if (parsed) {
          store.set(commentTranslationsAtom, (previous) => {
            const next = new Map(previous);
            batch.forEach((body, position) =>
              next.set(cacheKey(language, body), parsed[position]),
            );
            return next;
          });
        } else {
          failedBatches++;
          store.set(failedTranslationsAtom, (previous) => {
            const next = new Set(previous);
            batch.forEach((body) => next.add(cacheKey(language, body)));
            return next;
          });
        }

        if (cancelled) return;
        setProgress({ done: index + 1, total: batches.length });
      }

      if (cancelled) return;
      setProgress(null);

      if (failedBatches === batches.length) {
        showFailureToast(t("configs.translateFailed"), undefined, {
          channels: ["backend:aiComplete"],
          fallbackDescription: t("configs.translateFailedHint"),
        });
      } else if (failedBatches > 0) {
        toast.warning(t("configs.translatePartial"));
      }
    })();

    return () => {
      cancelled = true;
      setProgress(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, canTranslate, language, bodiesSignature, attempt]);

  const translations = new Map<string, string>();
  for (const body of bodies) {
    const translated = cache.get(cacheKey(language, body));
    if (translated !== undefined) translations.set(body, translated);
  }

  const hasFailed = bodies.some((body) => failed.has(cacheKey(language, body)));

  const retry = () => {
    getDefaultStore().set(failedTranslationsAtom, (previous) => {
      const next = new Set(previous);
      for (const body of bodies) next.delete(cacheKey(language, body));
      return next;
    });
    setAttempt((value) => value + 1);
  };

  return {
    canTranslate,
    translations,
    progress,
    isTranslating: progress !== null,
    hasFailed,
    retry,
  };
}

export function useConfigTexts(entries: ConfigEntry[], enabled: boolean) {
  const [state, setState] = useState<{
    entries: ConfigEntry[] | null;
    texts: Map<string, string>;
    done: number;
  }>({ entries: null, texts: new Map(), done: 0 });

  const loadedFor = useRef<ConfigEntry[] | null>(null);

  useEffect(() => {
    if (!enabled || loadedFor.current === entries) return;
    loadedFor.current = entries;

    let cancelled = false;
    const texts = new Map<string, string>();
    let next = 0;
    let done = 0;

    setState({ entries, texts, done: 0 });

    const worker = async () => {
      while (!cancelled && next < entries.length) {
        const entry = entries[next++];
        const text = await api.fs
          .readFile(entryPath(entry), "utf-8")
          .catch(() => "");
        if (text && text.length <= MAX_CONFIG_BYTES) {
          texts.set(entry.relative, text);
        }
        done++;
        if (!cancelled && done % 40 === 0) {
          setState({ entries, texts, done });
        }
      }
    };

    void Promise.all(
      Array.from({ length: READ_CONCURRENCY }, () => worker()),
    ).then(() => {
      if (!cancelled) setState({ entries, texts: new Map(texts), done });
    });

    return () => {
      cancelled = true;
      loadedFor.current = null;
    };
  }, [enabled, entries]);

  const isCurrent = state.entries === entries;

  return {
    texts: isCurrent ? state.texts : new Map<string, string>(),
    done: isCurrent ? state.done : 0,
    total: entries.length,
    isLoading: enabled && (!isCurrent || state.done < entries.length),
  };
}

export function useModIdentities(
  versionPath: string,
  mods: ILocalProject[] | undefined,
): ModIdentity[] | null {
  const modCount = mods?.length ?? 0;
  const cacheId = `${versionPath}|${modCount}`;
  const [loaded, setLoaded] = useState<{
    id: string;
    index: LocalModDependencyIndex | null;
  } | null>(null);

  useEffect(() => {
    if (!mods || modCount === 0) return;
    let cancelled = false;

    let task = dependencyIndexes.get(cacheId);
    if (!task) {
      task = api.modManager.localDependencies(versionPath).catch(() => null);
      dependencyIndexes.set(cacheId, task);
    }

    void task.then((index) => {
      if (!cancelled) setLoaded({ id: cacheId, index });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheId]);

  return useMemo(() => {
    if (!mods || modCount === 0) return [];
    if (loaded?.id !== cacheId) return null;
    return modIdentities(mods, loaded.index ?? {});
  }, [cacheId, loaded, modCount, mods]);
}
