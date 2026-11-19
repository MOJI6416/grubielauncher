import { Dispatch, SetStateAction } from "react";
import {
  IAddedLocalProject,
  ILocalIdentifyMatch,
  ILocalProject,
  IModpack,
  IProject,
  IVersion as ModVersion,
} from "@/types/ModManager";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  BlockedMods,
  IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { toLocalProject } from "./updates";
import { TrashEntry } from "./trash";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { withExtractProgress } from "@renderer/utilities/archiveProgress";
import { ImportLocalDialog, ImportMode } from "./ImportLocalDialog";
import { IdentifyLocalDialog, IdentifyReport } from "./IdentifyLocalDialog";
import { type DetailState } from "./contentManagerParts";
import type { TFunction } from "i18next";

const api = window.api;

export interface ContentDialogsProps {
  blockedMods: IBlockedMod[];
  clearTrash: () => Promise<void>;
  detail: DetailState | null;
  detailSelectedVersion: ModVersion | null;
  identifyReport: IdentifyReport | null;
  importing: IAddedLocalProject[];
  importMode: ImportMode;
  isClearTrashOpen: boolean;
  isImportOpen: boolean;
  lang: string;
  linkLocal: (matches: ILocalIdentifyMatch[]) => void;
  onClose: (modpack?: IModpack) => void;
  paths: { launcher: string; minecraft: string; java: string };
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
  commitImport: (added: ILocalProject[], mode: ImportMode) => void;
  sizeUnits: string[];
  t: TFunction<"translation", undefined>;
}

export function ContentDialogs({
  blockedMods,
  clearTrash,
  detail,
  detailSelectedVersion,
  identifyReport,
  importing,
  importMode,
  isClearTrashOpen,
  isImportOpen,
  lang,
  linkLocal,
  onClose,
  paths,
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
  commitImport,
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
          addProjects={(projects: IProject[]) =>
            commitImport(
              projects.map((project) =>
                toLocalProject(project, project.versions[0], {
                  keepLocalPath: true,
                  disabled: project.versions[0]?.files.some(
                    (file) => file.disabled === true,
                  ),
                }),
              ),
              importMode,
            )
          }
        />
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
