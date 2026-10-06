import { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  IAddedLocalProject,
  ILocalIdentifyMatch,
  ILocalProject,
  LocalModDependencyIndex,
  IModpack,
  IProject,
  IVersion as ModVersion,
  ProjectType,
} from "@/types/ModManager";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  BlockedMods,
  IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { ContentEntry, entryKey, isSameLocalProject } from "./entries";
import { toLocalProject } from "./updates";
import { TrashEntry } from "./trash";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { withExtractProgress } from "@renderer/utilities/archiveProgress";
import { ImportLocalDialog, ImportMode } from "./ImportLocalDialog";
import { IdentifyLocalDialog, IdentifyReport } from "./IdentifyLocalDialog";
import { type DetailState } from "./contentManagerParts";
import type { RefObject } from "react";
import type { TFunction } from "i18next";

import type { DeletionPlan } from "@renderer/utilities/mod";

const api = window.api;

export interface ContentDialogsProps {
  applyDeletion: (
    targets: ContentEntry[],
    mode: "selected" | "dependencies" | "dependents",
    dependencyIndex?: LocalModDependencyIndex | undefined,
  ) => void;
  blockedMods: IBlockedMod[];
  cascadeDeletionPlan: DeletionPlan;
  clearTrash: () => Promise<void>;
  detail: DetailState | null;
  detailSelectedVersion: ModVersion | null;
  identifyRef: RefObject<(onlyKeys?: ReadonlySet<string>) => Promise<void>>;
  identifyReport: IdentifyReport | null;
  importing: IAddedLocalProject[];
  importMode: ImportMode;
  isClearTrashOpen: boolean;
  isImportOpen: boolean;
  isOnline: boolean;
  lang: string;
  linkLocal: (matches: ILocalIdentifyMatch[]) => void;
  mods: ILocalProject[];
  onClose: (modpack?: IModpack) => void;
  paths: { launcher: string; minecraft: string; java: string };
  pendingDeletion: ContentEntry[] | null;
  pendingDeletionPlan: DeletionPlan;
  pendingDeletionTargets: ILocalProject[];
  projectType: ProjectType;
  restorableTrash: TrashEntry[];
  setBlockedMods: Dispatch<SetStateAction<IBlockedMod[]>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setExtractPercent: Dispatch<SetStateAction<number | null>>;
  setIdentifyReport: Dispatch<SetStateAction<IdentifyReport | null>>;
  setImporting: Dispatch<SetStateAction<IAddedLocalProject[]>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setIsClearTrashOpen: Dispatch<SetStateAction<boolean>>;
  setIsImportOpen: Dispatch<SetStateAction<boolean>>;
  setModpack: (modpack: IModpack) => void;
  setModpackStage: Dispatch<SetStateAction<"download" | "extract" | null>>;
  setMods: (mods: ILocalProject[]) => void;
  setPendingDeletion: Dispatch<SetStateAction<ContentEntry[] | null>>;
  setPendingRemoved: Dispatch<SetStateAction<ILocalProject[]>>;
  sizeUnits: string[];
  t: TFunction<"translation", undefined>;
}

export function ContentDialogs({
  applyDeletion,
  blockedMods,
  cascadeDeletionPlan,
  clearTrash,
  detail,
  detailSelectedVersion,
  identifyRef,
  identifyReport,
  importing,
  importMode,
  isClearTrashOpen,
  isImportOpen,
  isOnline,
  lang,
  linkLocal,
  mods,
  onClose,
  paths,
  pendingDeletion,
  pendingDeletionPlan,
  pendingDeletionTargets,
  projectType,
  restorableTrash,
  setBlockedMods,
  setBusyKey,
  setExtractPercent,
  setIdentifyReport,
  setImporting,
  setIsBusy,
  setIsClearTrashOpen,
  setIsImportOpen,
  setModpack,
  setModpackStage,
  setMods,
  setPendingDeletion,
  setPendingRemoved,
  sizeUnits,
  t,
}: ContentDialogsProps) {
  return (
    <>
      {isImportOpen && importing.length > 0 && (
        <ImportLocalDialog
          projects={importing}
          mode={importMode}
          lang={lang}
          sizeUnits={sizeUnits}
          onClose={() => {
            setIsImportOpen(false);
            setImporting([]);
          }}
          addProjects={(projects: IProject[]) => {
            const added = projects.map((project) =>
              toLocalProject(project, project.versions[0], {
                keepLocalPath: true,
                disabled: project.versions[0]?.files.some(
                  (file) => file.disabled === true,
                ),
              }),
            );

            setMods([...mods, ...added]);
            setPendingRemoved((prev) =>
              prev.filter(
                (item) =>
                  !added.some((project) => isSameLocalProject(item, project)),
              ),
            );

            const elsewhere = added.filter(
              (project) => project.projectType !== projectType,
            );
            const elsewhereLabels = [
              ...new Set(
                elsewhere.map((project) =>
                  t(`modManager.projectTypes.${project.projectType}`),
                ),
              ),
            ];

            const addedKeys = new Set(
              added.map((project) => entryKey(project.provider, project.id)),
            );

            toast.success(
              importMode === "restore"
                ? t("modManager.restoredCount", { n: added.length })
                : t("modManager.addedMultiple", { count: added.length }),
              {
                description:
                  elsewhereLabels.length > 0
                    ? t("modManager.addedElsewhere", {
                        types: elsewhereLabels.join(", "),
                      })
                    : undefined,
                action:
                  isOnline && importMode === "import"
                    ? {
                        label: t("modManager.identifyShort"),
                        onClick: () => void identifyRef.current(addedKeys),
                      }
                    : undefined,
              },
            );
          }}
        />
      )}

      {pendingDeletion && (
        <Confirmation
          title={t("modManager.deleteTitle")}
          wide
          reversible
          content={[
            {
              text: t("modManager.deleteSelected", {
                names: pendingDeletionTargets
                  .map((item) => item.title)
                  .join(", "),
              }),
            },
            ...(pendingDeletionPlan.blockers.length > 0
              ? [
                  {
                    text: t("modManager.deleteDependencyWarning"),
                    color: "warning" as const,
                  },
                ]
              : []),
            { text: t("modManager.deleteSaveHint") },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingDeletion(null),
            },
            {
              text: t(
                pendingDeletionPlan.blockers.length > 0
                  ? "modManager.deleteWithDependents"
                  : "modManager.deleteWithDependencies",
                { count: cascadeDeletionPlan.remove.length },
              ),
              color: "danger",
              onClick: () => applyDeletion(pendingDeletion, "dependents"),
            },
            {
              text: t("modManager.deleteOnlySelected"),
              color: "warning",
              onClick: () => applyDeletion(pendingDeletion, "selected"),
            },
          ]}
          onClose={() => setPendingDeletion(null)}
        >
          <div className="min-w-0 rounded-lg border border-border p-3 text-sm">
            <p className="mb-2 text-muted-foreground">
              {t("modManager.deleteList")}
            </p>
            <ul className="max-h-52 list-outside list-disc space-y-1 overflow-y-auto pl-5 [overflow-wrap:anywhere]">
              {cascadeDeletionPlan.remove.map((item) => (
                <li key={entryKey(item.provider, item.id)}>{item.title}</li>
              ))}
            </ul>
          </div>
        </Confirmation>
      )}

      {isClearTrashOpen && (
        <Confirmation
          title={t("modManager.trashClearTitle")}
          reversible={false}
          content={[
            {
              text: t("modManager.trashClearConfirm", {
                count: restorableTrash.length,
              }),
            },
          ]}
          buttons={[
            {
              text: t("modManager.trashClear"),
              color: "danger",
              onClick: async () => {
                setIsClearTrashOpen(false);
                await clearTrash();
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setIsClearTrashOpen(false),
            },
          ]}
          onClose={() => setIsClearTrashOpen(false)}
        />
      )}

      {identifyReport && (
        <IdentifyLocalDialog
          report={identifyReport}
          onClose={() => setIdentifyReport(null)}
          onLink={linkLocal}
        />
      )}

      {blockedMods.length > 0 && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (resolved) => {
            setBlockedMods([]);

            const first = resolved?.[0];
            if (
              !first?.filePath ||
              !detail?.project ||
              !detailSelectedVersion
            ) {
              setIsBusy(false);
              setBusyKey(null);
              return;
            }

            try {
              const temp = await api.path.join(paths.launcher, "temp");
              const targetPath = await api.path.join(
                temp,
                await api.path.basename(
                  first.fileName,
                  await api.path.extname(first.fileName),
                ),
              );

              const archivePath = first.filePath;

              setModpackStage("extract");
              await withExtractProgress(archivePath, setExtractPercent, () =>
                api.fs.extractZip(archivePath, targetPath),
              );

              const modpack = await api.modManager.checkModpack(
                targetPath,
                detail.project,
                detailSelectedVersion,
              );

              if (!modpack) {
                showFailureToast(t("modManager.notModpack"), undefined, {
                  channels: ["modManager:checkModpack"],
                  fallbackDescription: t("modManager.notModpackHint"),
                });
                return;
              }

              setModpack(modpack);
              onClose(modpack);
            } finally {
              setModpackStage(null);
              setIsBusy(false);
              setBusyKey(null);
            }
          }}
        />
      )}
    </>
  );
}
