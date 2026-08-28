import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { FolderSearch } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { pathsAtom } from "@renderer/stores/atoms";
import { findOrphanFolders } from "./orphans";

const api = window.api;

export function useOrphanFolders(instances: Version[]): string[] {
  const paths = useAtomValue(pathsAtom);
  const [folders, setFolders] = useState<string[]>([]);
  const names = useMemo(
    () => instances.map((instance) => instance.version.name),
    [instances],
  );
  const namesKey = JSON.stringify(names);

  useEffect(() => {
    if (!paths.minecraft) return;

    let cancelled = false;

    void (async () => {
      try {
        const versionsPath = await api.path.join(paths.minecraft, "versions");
        if (!(await api.fs.pathExists(versionsPath))) return;

        const directories = await api.fs.getDirectories(versionsPath);
        if (cancelled) return;

        setFolders(findOrphanFolders(directories, names));
      } catch {
        if (!cancelled) setFolders([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paths.minecraft, names, namesKey]);

  return folders;
}

export function OrphanFolders({ folders }: { folders: string[] }) {
  const paths = useAtomValue(pathsAtom);
  const { t } = useTranslation();

  if (!folders.length) return null;

  const openFolder = async (name?: string) => {
    try {
      const versionsPath = await api.path.join(paths.minecraft, "versions");
      const target = name
        ? await api.path.join(versionsPath, name)
        : versionsPath;
      await api.shell.openPath(target);
    } catch {}
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 shrink-0 items-center gap-1.5 self-start rounded-lg px-1.5 text-[0.7rem] text-faint transition-colors hover:bg-surface-2 hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <FolderSearch className="size-3.5" />
          {t("home.orphans.title", { count: folders.length })}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-xs leading-snug text-muted-foreground">
          {t("home.orphans.hint")}
        </p>

        <ul className="mt-2.5 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {folders.map((folder) => (
            <li key={folder}>
              <button
                type="button"
                onClick={() => void openFolder(folder)}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <FolderSearch className="size-3.5 shrink-0 text-faint" />
                <Hint content={folder} variant="text" truncatedOnly>
                  <span className="min-w-0 truncate">{folder}</span>
                </Hint>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => void openFolder()}
          className="mt-2 rounded text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("home.orphans.openRoot")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
