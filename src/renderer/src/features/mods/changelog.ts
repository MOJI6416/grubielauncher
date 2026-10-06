import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Provider, type IVersion } from "@/types/ModManager";
import { AI_PROMPT_MAX_CHARS } from "@/shared/config";
import { accountAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

export type ChangelogStatus = "loading" | "ready" | "empty" | "failed";

export interface VersionChangelog {
  key: string;
  text: string;
  status: ChangelogStatus;
}

const remoteChangelogs = new Map<string, Promise<string | null>>();
const translations = new Map<string, string>();

function changelogKey(
  provider: Provider | undefined,
  projectId: string | undefined,
  versionId: string | undefined,
): string {
  return `${provider ?? ""}:${projectId ?? ""}:${versionId ?? ""}`;
}

function fetchRemoteChangelog(
  provider: Provider,
  projectId: string,
  versionId: string,
): Promise<string | null> {
  const key = changelogKey(provider, projectId, versionId);
  const cached = remoteChangelogs.get(key);
  if (cached) return cached;

  const task = api.modManager
    .getChangelog(provider, projectId, versionId)
    .catch(() => null);
  remoteChangelogs.set(key, task);
  void task.then((text) => {
    if (text === null && remoteChangelogs.get(key) === task) {
      remoteChangelogs.delete(key);
    }
  });

  return task;
}

export function useVersionChangelog(input: {
  provider?: Provider;
  projectId?: string;
  version: IVersion | null | undefined;
}): VersionChangelog {
  const versionId = input.version?.id;
  const key = changelogKey(input.provider, input.projectId, versionId);
  const inline = input.version?.changelog?.trim() ?? "";
  const fetchable =
    !inline &&
    input.provider === Provider.CURSEFORGE &&
    !!input.projectId &&
    /^\d+$/.test(versionId ?? "");

  const [loaded, setLoaded] = useState<{
    key: string;
    text: string | null;
  } | null>(null);

  useEffect(() => {
    if (!fetchable || !input.provider || !input.projectId || !versionId) {
      return;
    }

    let cancelled = false;
    void fetchRemoteChangelog(input.provider, input.projectId, versionId).then(
      (text) => {
        if (!cancelled) setLoaded({ key, text });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [fetchable, input.projectId, input.provider, key, versionId]);

  if (inline) return { key, text: inline, status: "ready" };
  if (!fetchable) return { key, text: "", status: "empty" };
  if (loaded?.key !== key) return { key, text: "", status: "loading" };
  if (loaded.text === null) return { key, text: "", status: "failed" };

  const text = loaded.text.trim();
  return { key, text, status: text ? "ready" : "empty" };
}

export function useTranslatableText(key: string, text: string) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const account = useAtomValue(accountAtom);

  const cacheKey = `${key}|${lang}`;
  const [shown, setShown] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const translation = translations.get(cacheKey);
  const isTranslated = shown === cacheKey && translation !== undefined;
  const canTranslate =
    lang !== "en" && !!account && account.type !== "plain" && !!text;

  const toggle = async () => {
    if (isTranslated) {
      setShown(null);
      return;
    }

    if (translation !== undefined) {
      setShown(cacheKey);
      return;
    }

    const head = `Translate the following text to ${lang}, keep markdown and HTML formatting:\n\n`;
    setPending(cacheKey);

    try {
      const result = await api.backend.aiComplete(
        account?.accessToken || "",
        head + text.slice(0, AI_PROMPT_MAX_CHARS - head.length),
      );

      if (!result) {
        showFailureToast(t("modManager.translateChangelogError"), undefined, {
          channels: ["backend:aiComplete"],
        });
        return;
      }

      translations.set(cacheKey, result);
      setShown(cacheKey);
    } finally {
      setPending((current) => (current === cacheKey ? null : current));
    }
  };

  return {
    text: isTranslated && translation !== undefined ? translation : text,
    canTranslate,
    isTranslated,
    isTranslating: pending === cacheKey,
    toggle,
  };
}
