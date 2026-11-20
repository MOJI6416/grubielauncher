import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Folder, Loader2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { IVersionConf } from "@/types/IVersion";
import { renameInstanceKey } from "@/shared/instancesFile";
import { Hint } from "@renderer/components/Hint";
import {
  pathsAtom,
  versionsAtom,
  versionsRejectedAtom,
} from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { reloadInstanceLibrary } from "@renderer/utilities/version";
import {
  INSTANCE_NAME_MAX,
  checkInstanceName,
  instanceNameMessage,
  suggestInstanceName,
} from "@renderer/features/newInstance/nameValidation";
import { updateInstancesFile } from "./instancesStore";
import { repointLocalImage } from "./saveDecisions";

const api = window.api;

async function renameRejectedFolder(
  minecraftPath: string,
  folder: string,
  name: string,
): Promise<void> {
  const versionsPath = await api.path.join(minecraftPath, "versions");
  const oldPath = await api.path.join(versionsPath, folder);
  const newPath = await api.path.join(versionsPath, name);

  if (!(await api.fs.rename(oldPath, newPath))) {
    throw new Error(`Could not rename ${folder}`);
  }

  const confPath = await api.path.join(newPath, "version.json");
  const conf = await api.fs
    .readJSON<IVersionConf>(confPath, "utf-8")
    .catch(ignoreFailure);

  if (conf) {
    conf.name = name;
    const image = repointLocalImage(conf.image, oldPath, newPath);
    if (image) conf.image = image;
    await api.fs.writeJSON(confPath, conf);
  }

  updateInstancesFile((file) => renameInstanceKey(file, oldPath, newPath));
}

function RejectedRow({
  folder,
  unreadable,
  taken,
  takenFolders,
}: {
  folder: string;
  unreadable?: string;
  taken: string[];
  takenFolders: string[];
}) {
  const { t } = useTranslation();
  const paths = useAtomValue(pathsAtom);
  const [draft, setDraft] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  const issue = useMemo(() => checkInstanceName(folder, []), [folder]);
  const reason = unreadable
    ? t("versions.rejected.unreadable")
    : issue.issue === "tooLong"
      ? t("versions.rejected.tooLong", { max: INSTANCE_NAME_MAX })
      : instanceNameMessage(issue, t);

  const check = useMemo(
    () =>
      draft === null ? null : checkInstanceName(draft, taken, takenFolders),
    [draft, taken, takenFolders],
  );

  const openFolder = async () => {
    try {
      const target = await api.path.join(paths.minecraft, "versions", folder);
      await api.shell.openPath(target);
    } catch (error) {
      showFailureToast(t("versions.rejected.openFailed"), error);
    }
  };

  const startRename = () =>
    setDraft(suggestInstanceName(folder, [...taken, ...takenFolders]));

  const commit = async () => {
    if (draft === null || !check?.ok || isBusy) return;
    const name = draft.trim();

    setBusy(true);
    try {
      await renameRejectedFolder(paths.minecraft, folder, name);
      toast.success(t("versions.renamed", { name }));
      setDraft(null);
      await reloadInstanceLibrary();
    } catch (error) {
      showFailureToast(t("versions.renameError"), error, {
        channels: ["fs:rename", "fs:writeJSON"],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-11 min-w-0 items-center gap-2.5 rounded-xl bg-surface-2 px-2.5">
      <TriangleAlert className="size-4 shrink-0 text-warning" />

      {draft === null ? (
        <>
          <Hint content={folder} variant="text" truncatedOnly>
            <span className="max-w-[45%] min-w-0 shrink truncate text-sm font-medium text-foreground">
              {folder}
            </span>
          </Hint>
          <Hint
            content={unreadable ? `${reason}\n${unreadable}` : reason}
            variant="text"
            className="whitespace-pre-line"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {reason}
            </span>
          </Hint>
          {!unreadable && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={startRename}
            >
              {t("common.rename")}
            </Button>
          )}
          <Hint content={t("common.openFolder")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("common.openFolder")}
              onClick={() => void openFolder()}
            >
              <Folder />
            </Button>
          </Hint>
        </>
      ) : (
        <>
          <Input
            autoFocus
            value={draft}
            maxLength={INSTANCE_NAME_MAX + 8}
            aria-label={t("common.rename")}
            aria-invalid={!check?.ok}
            disabled={isBusy}
            className="h-8 max-w-64 min-w-0 flex-1"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(null);
              }
            }}
          />
          <Hint
            content={check?.ok ? folder : instanceNameMessage(check!, t)}
            variant="text"
            truncatedOnly
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs",
                check?.ok ? "text-faint" : "text-destructive",
              )}
            >
              {check?.ok ? folder : instanceNameMessage(check!, t)}
            </span>
          </Hint>
          <Hint content={t("common.rename")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("common.rename")}
              disabled={!check?.ok || isBusy}
              onClick={() => void commit()}
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
          </Hint>
          <Hint content={t("common.cancel")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("common.cancel")}
              disabled={isBusy}
              onClick={() => setDraft(null)}
            >
              <X />
            </Button>
          </Hint>
        </>
      )}
    </div>
  );
}

export function RejectedInstances({ orphans }: { orphans: string[] }) {
  const rejected = useAtomValue(versionsRejectedAtom);
  const versions = useAtomValue(versionsAtom);

  const taken = useMemo(
    () => versions.map((instance) => instance.version.name),
    [versions],
  );

  if (rejected.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {rejected.map((entry) => (
        <RejectedRow
          key={entry.folder}
          folder={entry.folder}
          unreadable={entry.unreadable}
          taken={taken}
          takenFolders={[
            ...orphans,
            ...rejected
              .map((other) => other.folder)
              .filter((other) => other !== entry.folder),
          ]}
        />
      ))}
    </div>
  );
}
