import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ILocalProject } from "@/types/ModManager";
import type { IServerConf } from "@/types/Server";
import type { TSettings } from "@/types/Settings";
import type { ModrinthDownloadReason } from "@/shared/modrinthDownloadMeta";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { Version } from "@renderer/classes/Version";
import { Mods } from "@renderer/classes/Mods";
import {
  applyBlockedModFilePaths,
  checkBlockedMods,
  IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import type {
  CommitMods,
  ContentCommit,
} from "@renderer/features/mods/contentCommit";
import { listTrash, trashFolder } from "@renderer/features/mods/trash";
import {
  folderNameForType,
  forgetAllModFiles,
} from "@renderer/features/mods/modFiles";
import {
  expectQuarantine,
  fileNamesOf,
} from "@renderer/features/mods/expectedQuarantine";
import {
  createContentApplier,
  type ContentApplierState,
} from "./contentApplier";
import {
  diffContent,
  invertContent,
  planTrashRestore,
  restoredItems,
} from "./contentChanges";
import {
  bumpInstanceDataRevision,
  useInstanceDataRevision,
} from "./instanceRevision";

const api = window.api;

const BLOCKED_SKIPPED = "content-blocked-skipped";

interface ApplyOptions {
  sync: boolean;
  restore?: { items: ILocalProject[]; since: number };
  downloadReasons?: Record<string, ModrinthDownloadReason>;
}

async function restoreFromTrash(
  versionPath: string,
  restore: NonNullable<ApplyOptions["restore"]>,
) {
  const trash = await listTrash(versionPath);
  if (trash.length === 0) return;

  const types = [...new Set(restore.items.map((item) => item.projectType))];
  const present = new Map(
    await Promise.all(
      types.map(async (type) => {
        const folder = await api.path.join(
          versionPath,
          await folderNameForType(type),
        );
        const names = (await api.fs.readdir(folder).catch(ignoreFailure)) ?? [];
        return [
          type,
          new Set(names.map((name) => name.toLowerCase())),
        ] as const;
      }),
    ),
  );

  const steps = planTrashRestore({
    items: restore.items,
    present,
    trash: trash.map((entry) => entry.raw),
    since: restore.since,
  });
  if (steps.length === 0) return;

  const source = await trashFolder(versionPath);
  for (const step of steps) {
    const folder = await api.path.join(
      versionPath,
      await folderNameForType(step.projectType),
    );
    await api.fs.ensure(folder);
    await api.fs.rename(
      await api.path.join(source, step.raw),
      await api.path.join(folder, step.target),
    );
  }
}

export function useInstanceContent({
  version,
  settings,
  server,
  isRunning,
  requestBlockedFiles,
  onApplied,
}: {
  version: Version | undefined;
  settings: TSettings;
  server: IServerConf | undefined;
  isRunning: boolean;
  requestBlockedFiles: (mods: IBlockedMod[]) => Promise<IBlockedMod[] | null>;
  onApplied: () => void;
}) {
  const { t } = useTranslation();
  const context = useLatestRef({
    settings,
    server,
    isRunning,
    requestBlockedFiles,
    onApplied,
    t,
  });
  const dataRevision = useInstanceDataRevision();

  const [state, setState] = useState<ContentApplierState>(() => ({
    mods: version?.version.loader.mods ?? [],
    applying: false,
  }));

  const applier = useMemo(() => {
    if (!version) return null;

    return createContentApplier<ApplyOptions>({
      read: () => version.version.loader.mods ?? [],
      onChange: setState,
      persist: async (next, previous, options) => {
        const current = context.current;
        const checked = await checkBlockedMods(next, version.versionPath);
        let resolved = checked.mods;

        if (checked.blockedMods.length > 0) {
          const files = await current.requestBlockedFiles(checked.blockedMods);
          if (!files) throw new Error(BLOCKED_SKIPPED);
          resolved = [...resolved];
          applyBlockedModFilePaths(resolved, files);
        }

        const conf = version.version;
        conf.loader.mods = resolved;
        const diff = diffContent(previous, resolved);
        const release = expectQuarantine(
          conf.name,
          fileNamesOf([
            ...diff.removed,
            ...diff.changed.map((change) => change.before),
          ]),
        );

        try {
          if (options?.restore) {
            await restoreFromTrash(version.versionPath, options.restore);
          }

          if (options?.sync !== false) {
            const content = new Mods(current.settings, conf, current.server);
            const install = options?.downloadReasons
              ? { downloadReasons: options.downloadReasons }
              : undefined;
            if (current.isRunning) await content.syncLive(install);
            else await content.check(install);
          }

          if (!(await version.save())) throw new Error("version save failed");
        } catch (error) {
          conf.loader.mods = previous;
          throw error;
        } finally {
          release();
        }
      },
    });
  }, [version]);

  useEffect(() => {
    if (!applier) {
      setState({ mods: [], applying: false });
      return;
    }
    applier.reload();
  }, [applier, dataRevision]);

  const apply = useCallback(
    async (
      next: ILocalProject[],
      commit: ContentCommit,
      options: ApplyOptions,
    ): Promise<boolean> => {
      if (!applier || !version) return false;
      const { t: translate } = context.current;
      const before = applier.current();
      const startedAt = Date.now();

      try {
        const outcome = await applier.apply(next, options);
        if (outcome === "dropped") return false;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === VERSION_INSTALL_CANCELLED) {
          toast(translate("modManager.applyCancelled"));
        } else if (message === BLOCKED_SKIPPED) {
          toast.warning(translate("modManager.applyBlockedSkipped"));
        } else {
          showFailureToast(commit.failTitle, error, {
            channels: ["mods:check", "mods:syncLive", "version:save", "fs:"],
          });
        }
        return false;
      }

      forgetAllModFiles(version.versionPath);
      bumpInstanceDataRevision();
      context.current.onApplied();

      const undo =
        commit.undo === false
          ? null
          : (commit.undo ??
            (() => {
              const current = applier.current();
              const reverted = invertContent(before, next, current);
              void apply(
                reverted,
                {
                  title: translate("modManager.undone"),
                  failTitle: translate("modManager.undoFailed"),
                  undo: false,
                },
                {
                  sync: options.sync,
                  restore: {
                    items: restoredItems(current, reverted),
                    since: startedAt,
                  },
                },
              );
            }));

      if (undo) {
        showUndoToast(commit.title, undo, {
          description: commit.description,
          tone: commit.tone,
        });
      } else if (commit.tone === "warning") {
        toast.warning(commit.title, { description: commit.description });
      } else {
        toast.success(commit.title, { description: commit.description });
      }

      return true;
    },
    [applier, version],
  );

  const commitMods = useCallback<CommitMods>(
    (next, commit) =>
      apply(next, commit, {
        sync: commit.sync !== false,
        downloadReasons: commit.downloadReasons,
        restore:
          commit.restoreFromTrash && applier
            ? { items: restoredItems(applier.current(), next), since: 0 }
            : undefined,
      }),
    [applier, apply],
  );

  const idle = useCallback(
    () => applier?.idle() ?? Promise.resolve(),
    [applier],
  );

  return {
    mods: state.mods,
    isApplying: state.applying,
    commitMods,
    idle,
  };
}
