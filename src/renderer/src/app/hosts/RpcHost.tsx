import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  accountAtom,
  authDataAtom,
  consolesMetaAtom,
  rpcSkinVersionAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { streamerActiveAtom } from "@renderer/features/streamer/streamerMode";
import { useOwnProfileVisibility } from "@renderer/features/profile/ownProfileVisibility";
import { resolvePackManifest } from "@renderer/utilities/packShortCode";
import { buildPackUrl, buildProfileUrl } from "@/shared/siteLinks";
import type { RpcPackLink } from "@/types/Rpc";

const api = window.api;

function sameLinks(a: RpcPackLink[], b: RpcPackLink[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (link, index) =>
        link.versionName === b[index].versionName && link.url === b[index].url,
    )
  );
}

function useRunningPackLinks(enabled: boolean): RpcPackLink[] {
  const consoles = useAtomValue(consolesMetaAtom);
  const versions = useAtomValue(versionsAtom);
  const [links, setLinks] = useState<RpcPackLink[]>([]);

  const running = useMemo(() => {
    if (!enabled) return [];
    const names = new Set(
      consoles
        .filter((meta) => meta.status === "running")
        .map((meta) => meta.versionName),
    );
    return versions
      .filter((version) => names.has(version.version.name))
      .flatMap((version) =>
        version.version.shareCode
          ? [{ versionName: version.version.name, code: version.version.shareCode }]
          : [],
      );
  }, [consoles, enabled, versions]);

  const runningKey = running
    .map((entry) => `${entry.versionName}:${entry.code}`)
    .join("|");

  useEffect(() => {
    let active = true;

    void Promise.all(
      running.map(async ({ versionName, code }) => {
        const manifest = await resolvePackManifest(code);
        if (!manifest || manifest.isPublic === false) return null;
        return { versionName, url: buildPackUrl(manifest.shortCode || code) };
      }),
    ).then((resolved) => {
      if (!active) return;
      const next = resolved.filter((link): link is RpcPackLink => !!link);
      setLinks((previous) => (sameLinks(previous, next) ? previous : next));
    });

    return () => {
      active = false;
    };
  }, [runningKey]);

  return links;
}

export function RpcHost() {
  const { i18n } = useTranslation();
  const selectedAccount = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const settings = useAtomValue(settingsAtom);
  const rpcSkinVersion = useAtomValue(rpcSkinVersionAtom);
  const isStreaming = useAtomValue(streamerActiveAtom);
  const visibility = useOwnProfileVisibility();
  const hideServer = settings.hideServerInRpc || isStreaming;
  const packLinks = useRunningPackLinks(!isStreaming);

  const profileUrl =
    visibility?.isPublic && selectedAccount
      ? buildProfileUrl(selectedAccount.nickname, authData?.sub)
      : null;

  useEffect(() => {
    void api.rpc.syncContext({
      account: selectedAccount
        ? {
            nickname: selectedAccount.nickname,
            type: selectedAccount.type,
            uuid: authData?.uuid,
          }
        : null,
      lang: i18n.resolvedLanguage || i18n.language || "en",
      hideServer,
      skinVersion: rpcSkinVersion,
      profileUrl,
      packLinks,
    });
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    selectedAccount?.nickname,
    selectedAccount?.type,
    authData?.uuid,
    hideServer,
    rpcSkinVersion,
    profileUrl,
    packLinks,
  ]);

  return null;
}
