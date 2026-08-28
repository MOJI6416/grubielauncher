import { Suspense, useEffect, useMemo, useState } from "react";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { IServer } from "@/types/ServersList";
import { Mods } from "@renderer/classes/Mods";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import { ModpackDiffPanel } from "@renderer/features/instances/ModpackDiffPanel";
import {
  blockedModsAtom,
  blockedModsOpenAtom,
  blockedModsResumeAtom,
  launchServersAtom,
  launchUpdateDiffAtom,
  launchUpdateOpenAtom,
  launchUpdateRemoteServersAtom,
  pendingLaunchAtom,
} from "@renderer/features/launch/atoms";
import { readInstanceServers } from "@renderer/features/instances/instanceServers";
import { serversLostBySync } from "@renderer/features/instances/updateSummary";
import { LazyBlockedMods } from "@renderer/features/launch/lazyDialogs";
import { runGame } from "@renderer/features/launch/runGame";
import { registerGameRunner } from "@renderer/features/launch/runGameBridge";
import {
  accountAtom,
  isRunningAtom,
  selectedVersionAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { applyBlockedModFilePaths, checkBlockedMods } from "@renderer/utilities/blockedMods";
import { preload } from "@renderer/utilities/lazyPreload";
import {
  reportShareSyncInterruption,
  syncShare,
} from "@renderer/utilities/version";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

export function LaunchHost() {
  const { t } = useTranslation();
  const setIsRunning = useSetAtom(isRunningAtom);
  const setSelectedVersion = useSetAtom(selectedVersionAtom);
  const [isUpdateOpen, setIsUpdateOpen] = useAtom(launchUpdateOpenAtom);
  const [isBlockedOpen, setIsBlockedOpen] = useAtom(blockedModsOpenAtom);
  const blockedMods = useAtomValue(blockedModsAtom);
  const setBlockedMods = useSetAtom(blockedModsAtom);
  const pendingDiff = useAtomValue(launchUpdateDiffAtom);
  const setPendingDiff = useSetAtom(launchUpdateDiffAtom);
  const remoteServers = useAtomValue(launchUpdateRemoteServersAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [localServers, setLocalServers] = useState<IServer[] | null>([]);

  useEffect(() => {
    const unregister = registerGameRunner(runGame);
    const unsubscribeLaunch = api.events.onLaunch(() => {
      setIsRunning(false);
    });

    return () => {
      unregister();
      unsubscribeLaunch();
    };
  }, [setIsRunning]);

  useEffect(() => {
    if (!isUpdateOpen) {
      setLocalServers([]);
      return;
    }

    const instance = getDefaultStore().get(selectedVersionAtom);
    if (!instance) return;

    let cancelled = false;
    void readInstanceServers(instance.versionPath).then((servers) => {
      if (!cancelled) setLocalServers(servers);
    });

    return () => {
      cancelled = true;
    };
  }, [isUpdateOpen]);

  const lostServers = useMemo(
    () => (localServers ? serversLostBySync(localServers, remoteServers) : []),
    [localServers, remoteServers],
  );

  const takePendingLaunch = () => {
    const store = getDefaultStore();
    const pending = store.get(pendingLaunchAtom);
    store.set(pendingLaunchAtom, null);
    return pending;
  };

  return (
    <>
      {isUpdateOpen && (
        <Confirmation
          onClose={() => {
            if (isLoading) return;
            takePendingLaunch();
            setPendingDiff(null);
            setIsUpdateOpen(false);
            setIsRunning(false);
          }}
          title={t("versions.updateAvailable")}
          content={[
            { color: "warning", text: t("versions.hostChanged") },
            ...(localServers === null
              ? [
                  {
                    color: "warning" as const,
                    text: t("versions.syncServers.unknownHint"),
                  },
                ]
              : lostServers.length > 0
                ? [
                    {
                      color: "warning" as const,
                      text: t("versions.syncServers.hint"),
                    },
                  ]
                : []),
          ]}
          buttons={[
            {
              text: t("common.update"),
              color: "success",
              loading: isLoading,
              onClick: async () => {
                const store = getDefaultStore();
                const sv = store.get(selectedVersionAtom);
                const s0 = store.get(settingsAtom);
                const acc = store.get(accountAtom);
                if (!sv || !s0) return;

                setIsLoading(true);

                try {
                  const updated = await syncShare(
                    sv,
                    store.get(launchServersAtom),
                    s0,
                    acc?.accessToken || "",
                  );

                  setSelectedVersion(updated);

                  const { blockedMods: bMods, mods: resolvedMods } =
                    await checkBlockedMods(
                      updated.version.loader.mods,
                      updated.versionPath,
                    );
                  updated.version.loader.mods = resolvedMods;
                  if (bMods.length > 0) {
                    preload(LazyBlockedMods.preload);
                    setBlockedMods(bMods);
                    setIsBlockedOpen(true);
                    setIsLoading(false);
                    return;
                  }

                  setIsUpdateOpen(false);
                  setIsLoading(false);

                  await runGame({
                    ...takePendingLaunch(),
                    skipUpdate: true,
                    version: updated,
                  });
                } catch (error) {
                  if (!reportShareSyncInterruption(error)) {
                    showFailureToast(t("versions.updateError"), error, {
                      channels: [
                        "version:save",
                        "servers:write",
                        "fs:",
                        "backend:getModpack",
                      ],
                    });
                  }
                  setIsLoading(false);
                }
              },
            },
            {
              text: t("versions.runWithoutUpdating"),
              onClick: async () => {
                setIsUpdateOpen(false);
                const pending = takePendingLaunch();

                await runGame({
                  ...pending,
                  skipUpdate: true,
                  version:
                    pending?.version ||
                    getDefaultStore().get(selectedVersionAtom),
                });
              },
            },
          ]}
        >
          {lostServers.length > 0 && (
            <ul className="grid gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2">
              {lostServers.map((name) => (
                <li key={name} className="truncate text-xs text-foreground">
                  {name}
                </li>
              ))}
            </ul>
          )}
          {pendingDiff && <ModpackDiffPanel diff={pendingDiff} />}
        </Confirmation>
      )}

      {isBlockedOpen && blockedMods.length > 0 && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyBlockedMods
            mods={blockedMods}
            onClose={async (bMods) => {
              setIsBlockedOpen(false);

              const resumeStore = getDefaultStore();
              const resume = resumeStore.get(blockedModsResumeAtom);
              if (resume) {
                resumeStore.set(blockedModsResumeAtom, null);
                setIsLoading(false);
                try {
                  await resume.run(bMods ?? null);
                } catch (error) {
                  showFailureToast(t("friends.joinFlow.failed"), error);
                }
                return;
              }

              if (!bMods) {
                setIsUpdateOpen(false);
                setIsLoading(false);
                takePendingLaunch();
                return;
              }

              const store = getDefaultStore();
              const sv = store.get(selectedVersionAtom);
              const s0 = store.get(settingsAtom);
              if (!sv || !s0) return;

              const hasBlockedPaths = applyBlockedModFilePaths(
                sv.version.loader.mods,
                bMods,
              );
              if (hasBlockedPaths) await sv.save();

              const versionMods = new Mods(s0, sv.version);
              await versionMods.check();

              setIsUpdateOpen(false);
              setIsLoading(false);

              await runGame({
                ...takePendingLaunch(),
                skipUpdate: true,
                version: sv,
              });
            }}
          />
        </Suspense>
      )}
    </>
  );
}
