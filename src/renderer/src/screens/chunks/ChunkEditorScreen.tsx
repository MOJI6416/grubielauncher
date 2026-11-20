import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Earth } from "lucide-react";
import { IWorld } from "@/types/World";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  accountAtom,
  consolesMetaAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { instanceKey } from "@renderer/features/instances/selectors";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { isOwner } from "@renderer/utilities/versionPure";
import { goBack, navigate } from "@renderer/navigation/navigate";
import { canGoBackAtom } from "@renderer/navigation/store";
import { ChunkEditor } from "@renderer/features/worlds/chunks/ChunkEditor";
import { chunkEditorWorldAtom } from "@renderer/features/worlds/chunks/chunkEditorWorld";

const api = window.api;

export function ChunkEditorScreen({
  instanceId,
  folder,
}: {
  instanceId: string;
  folder: string;
}) {
  const { t, i18n } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const consoleMetas = useAtomValue(consolesMetaAtom);
  const canBack = useAtomValue(canGoBackAtom);
  const setEditorWorld = useSetAtom(chunkEditorWorldAtom);
  const [loaded, setLoaded] = useState<{
    path: string;
    world: IWorld | null;
  } | null>(null);

  const instance = versions.find(
    (version) => instanceKey(version) === instanceId,
  );
  const worldPath = instance
    ? api.path.join(instance.versionPath, "saves", folder)
    : null;

  useEffect(() => {
    if (!worldPath || !account) return;
    let cancelled = false;

    void (async () => {
      let world: IWorld | null = null;
      try {
        world = await api.worlds.readWorld(worldPath, account);
      } catch (error) {
        console.error(error);
      }
      if (!cancelled) setLoaded({ path: worldPath, world });
    })();

    return () => {
      cancelled = true;
    };
  }, [account, worldPath]);

  const world =
    !worldPath || !account
      ? null
      : loaded?.path === worldPath
        ? loaded.world
        : undefined;

  useEffect(() => {
    if (world) setEditorWorld({ instanceId, folder, name: world.name });
  }, [folder, instanceId, setEditorWorld, world]);

  const leave = () => {
    if (canBack) {
      goBack();
      return;
    }
    navigate(
      instance
        ? { name: "instance", id: instanceId, tab: "worlds" }
        : { name: "home" },
      { replace: true },
    );
  };

  if (world === undefined) {
    return (
      <div
        aria-busy
        className="flex h-full min-h-0 flex-col gap-3 rounded-xl border bg-card p-3"
      >
        <Skeleton className="h-9 w-72 rounded-lg" />
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      </div>
    );
  }

  if (!instance || !world) {
    return (
      <Empty className="h-full border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Earth />
          </EmptyMedia>
          <EmptyTitle>
            {instance ? t("worldChunks.worldMissing") : t("versions.notFound")}
          </EmptyTitle>
          <EmptyDescription>{t("worldChunks.missingHint")}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" onClick={leave}>
          {t("shell.back")}
        </Button>
      </Empty>
    );
  }

  const isVersionRunning = consoleMetas.some(
    (meta) =>
      meta.versionName === instance.version.name && meta.status === "running",
  );
  const lockReason = isVersionRunning
    ? t("worlds.disabledWhileRunning")
    : world.isDownloaded
      ? t("worlds.downloadedHint")
      : !isOwner(instance.version.owner, account, instance.version.ownerId)
        ? t("worlds.notOwnerHint")
        : undefined;

  return (
    <ChunkEditor
      key={world.path}
      world={world}
      locked={lockReason !== undefined}
      lockReason={lockReason}
      locale={i18n.resolvedLanguage || i18n.language}
      onChanged={bumpInstanceDataRevision}
    />
  );
}
