import { IWorld } from "@/types/World";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  accountAtom,
  isOwnerVersionAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { WorldList } from "./WorldList";
import { RunGameParams } from "@renderer/App";
import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ILocalProject } from "@/types/ModManager";

const api = window.api;

export function Worlds({
  onClose,
  runGame,
  mods,
}: {
  onClose: (isFull?: boolean) => void;
  runGame: (params: RunGameParams) => Promise<void>;
  mods?: ILocalProject[];
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [worlds, setWorlds] = useState<IWorld[]>([]);

  const [version] = useAtom(selectedVersionAtom);
  const [account] = useAtom(accountAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);

  const { t } = useTranslation();

  useEffect(() => {
    if (!version) {
      onClose();
      return;
    }

    if (!account) {
      setWorlds([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    (async () => {
      try {
        const worldsPath = await api.path.join(version.versionPath, "saves");
        if (!(await api.fs.pathExists(worldsPath))) {
          setWorlds([]);
          return;
        }

        const folders = await api.fs.getDirectories(worldsPath);

        const results = await Promise.all(
          folders.map(async (folder) => {
            const worldPath = await api.path.join(worldsPath, folder);
            return api.worlds.readWorld(worldPath, account);
          }),
        );

        setWorlds(results.filter(Boolean) as IWorld[]);
      } catch (error) {
        toast(t("worlds.noWorlds"));
        onClose();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [version, account]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;

          if (
            target.closest(
              '[data-slot="dropdown-menu-content"], [data-radix-popper-content-wrapper], [data-slot="dialog-content"]',
            )
          ) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
        className="overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b py-4 pr-12 pl-5">
          <DialogTitle>{t("worlds.title")}</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 px-5 pb-4">
          {isLoading ? (
            <div className="flex h-[26rem] w-full items-center justify-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : worlds.length === 0 ? (
            <Empty className="min-h-56 border border-dashed bg-muted/20">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpen />
                </EmptyMedia>
                <EmptyTitle>{t("worlds.noWorlds")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <WorldList
              worlds={worlds}
              setWorlds={setWorlds}
              isOwner={isOwnerVersion}
              runGame={runGame}
              closeModal={() => onClose(true)}
              mods={mods}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
