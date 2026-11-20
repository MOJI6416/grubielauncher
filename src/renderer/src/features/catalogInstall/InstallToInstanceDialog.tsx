import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Loader2, PackageCheck, Plus } from "lucide-react";
import { IProject, ProjectType } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { Version } from "@renderer/classes/Version";
import {
  accountAtom,
  consolesMetaAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { isOwner } from "@renderer/utilities/versionPure";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { ProjectIcon } from "@renderer/features/mods/ProjectIcon";
import { displayTitle } from "@renderer/features/mods/titles";
import { InstanceArt } from "@renderer/features/instances/InstanceArt";
import { instanceKey } from "@renderer/features/instances/selectors";
import { openInstanceScreen } from "@renderer/features/instances/openInstanceScreen";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import type { CatalogInstallRequest } from "./catalogInstallStore";
import {
  INSTALL_BLOCKED,
  commitInstallInto,
  findInInstance,
  instanceFetchers,
  pickModpackVersion,
  planInstallInto,
} from "./installToInstance";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

type Fit = "checking" | "fits" | "missing";

function groupKey(instance: Version): string {
  return `${instance.version.version.id}|${instance.version.loader.name}`;
}

function lastLaunch(instance: Version): number {
  const value = instance.version.lastLaunch;
  return value ? new Date(value).getTime() || 0 : 0;
}

export function InstallToInstanceDialog({
  request,
  onClose,
}: {
  request: CatalogInstallRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const consoles = useAtomValue(consolesMetaAtom);

  const [project, setProject] = useState<IProject | null>(
    request.kind === "project" ? request.project : null,
  );
  const [versionId, setVersionId] = useState<string | undefined>(
    request.kind === "project" ? request.versionId : undefined,
  );
  const [failed, setFailed] = useState(false);
  const [fits, setFits] = useState<Record<string, Fit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (request.kind !== "link") return;
    let cancelled = false;

    void (async () => {
      const resolved = await api.modManager
        .resolveCatalogLink(request.link)
        .catch(ignoreFailure);
      if (cancelled) return;
      if (!resolved) {
        setFailed(true);
        return;
      }

      if (
        request.link.target === "modpack" ||
        resolved.project.projectType === ProjectType.MODPACK
      ) {
        const list = await api.modManager
          .getVersions(resolved.project.provider, resolved.project.id, {
            projectType: ProjectType.MODPACK,
            modUrl: resolved.project.url,
          })
          .catch(ignoreFailure);
        if (cancelled) return;
        const version = pickModpackVersion(list ?? [], resolved.versionId);
        if (!version) {
          setFailed(true);
          return;
        }
        onClose();
        openNewInstance({ catalogPack: { project: resolved.project, version } });
        return;
      }

      setProject(resolved.project);
      setVersionId(resolved.versionId);
    })();

    return () => {
      cancelled = true;
    };
  }, [onClose, request]);

  const targets = useMemo(
    () =>
      versions
        .filter(
          (instance) =>
            !instance.version.downloadedVersion &&
            (!instance.version.owner && !instance.version.ownerId
              ? true
              : isOwner(
                  instance.version.owner,
                  account ?? undefined,
                  instance.version.ownerId,
                )),
        )
        .sort((a, b) => lastLaunch(b) - lastLaunch(a)),
    [account, versions],
  );

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const groups = new Map<string, Version>();
    for (const instance of targets) {
      const key = groupKey(instance);
      if (!groups.has(key)) groups.set(key, instance);
    }
    setFits(
      Object.fromEntries([...groups.keys()].map((key) => [key, "checking"])),
    );

    void (async () => {
      for (const [key, instance] of groups) {
        const list = await instanceFetchers(instance)
          .fetchVersions(project)
          .catch(ignoreFailure);
        if (cancelled) return;
        setFits((prev) => ({
          ...prev,
          [key]: list && list.length > 0 ? "fits" : "missing",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, targets]);

  const rows = useMemo(() => {
    if (!project) return [];
    const rank = (instance: Version) => {
      if (done.has(instanceKey(instance)) || findInInstance(instance, project))
        return 1;
      return fits[groupKey(instance)] === "missing" ? 2 : 0;
    };
    return [...targets].sort((a, b) => rank(a) - rank(b));
  }, [done, fits, project, targets]);

  const install = async (instance: Version) => {
    if (!project) return;
    const key = instanceKey(instance);
    setBusy(key);
    try {
      const plan = await planInstallInto(instance, project, versionId);
      if (plan.status === "already") {
        setDone((prev) => new Set(prev).add(key));
        return;
      }
      if (plan.status === "noVersion") {
        setFits((prev) => ({ ...prev, [groupKey(instance)]: "missing" }));
        return;
      }
      await commitInstallInto(instance, plan.added, settings);
      countFeature("mods.installTo");
      setDone((prev) => new Set(prev).add(key));
      toast.success(
        t("catalogInstall.installed", {
          title: displayTitle(project.title),
          instance: instance.version.name,
        }),
        {
          description:
            plan.added.length > 1
              ? t("catalogInstall.withDependencies", {
                  count: plan.added.length - 1,
                })
              : undefined,
          action: {
            label: t("catalogInstall.openInstance"),
            onClick: () =>
              openInstanceScreen(instance, account, { tab: "content" }),
          },
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message === INSTALL_BLOCKED) {
        toast.warning(t("catalogInstall.blocked"), {
          action: {
            label: t("catalogInstall.openInstance"),
            onClick: () =>
              openInstanceScreen(instance, account, { tab: "content" }),
          },
        });
        return;
      }
      showFailureToast(t("modManager.failed.install"), error, {
        channels: ["mods:check", "version:save", "modManager:"],
      });
    } finally {
      setBusy(null);
    }
  };

  const title = project ? displayTitle(project.title) : "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate">
            {project
              ? t("catalogInstall.title", { title })
              : t("catalogInstall.loadingTitle")}
          </DialogTitle>
          <DialogDescription>{t("catalogInstall.description")}</DialogDescription>
        </DialogHeader>

        {failed ? (
          <Empty className="gap-2 rounded-lg border border-dashed border-border px-3 py-6">
            <EmptyTitle className="text-sm">
              {t("catalogInstall.notFound")}
            </EmptyTitle>
            <EmptyDescription className="text-xs">
              {t("catalogInstall.notFoundHint")}
            </EmptyDescription>
          </Empty>
        ) : !project ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-2 p-2.5">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-1 text-faint">
                <ProjectIcon src={project.iconUrl} size={40} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ContentProviderIcon
                    provider={project.provider}
                    className="size-3.5 shrink-0 text-faint"
                  />
                  <Hint content={project.title} variant="text" truncatedOnly>
                    <span className="truncate text-sm font-medium text-foreground">
                      {title}
                    </span>
                  </Hint>
                </span>
                <Hint content={project.description} variant="text" truncatedOnly>
                  <span className="truncate text-xs text-muted-foreground">
                    {project.description}
                  </span>
                </Hint>
              </div>
            </div>

            {rows.length === 0 ? (
              <Empty className="gap-2 rounded-lg border border-dashed border-border px-3 py-6">
                <EmptyDescription className="text-xs">
                  {t("catalogInstall.noInstances")}
                </EmptyDescription>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    openNewInstance();
                  }}
                >
                  <Plus className="size-3.5" />
                  {t("catalogInstall.createInstance")}
                </Button>
              </Empty>
            ) : (
              <div
                role="list"
                className="-mx-1 flex max-h-80 flex-col gap-0.5 overflow-y-auto px-1"
              >
                {rows.map((instance) => {
                  const key = instanceKey(instance);
                  const conf = instance.version;
                  const installed =
                    done.has(key) || !!findInInstance(instance, project);
                  const running = consoles.some(
                    (meta) =>
                      meta.versionName === conf.name &&
                      meta.status === "running",
                  );
                  const fit = fits[groupKey(instance)] ?? "checking";

                  return (
                    <div
                      key={key}
                      role="listitem"
                      className="flex h-12 min-w-0 items-center gap-2.5 rounded-lg px-2 hover:bg-row-hover"
                    >
                      <InstanceArt
                        name={conf.name}
                        image={conf.image}
                        className="size-8 shrink-0 rounded-md"
                        textClassName="text-xs"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <Hint content={conf.name} variant="text" truncatedOnly>
                          <span className="truncate text-sm text-foreground">
                            {conf.name}
                          </span>
                        </Hint>
                        <span className="flex min-w-0 items-center gap-1.5 text-2xs text-faint">
                          <span className="font-mono tabular-nums">
                            {conf.version.id}
                          </span>
                          <LoaderLabel loader={conf.loader.name} />
                        </span>
                      </div>

                      {installed ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                          <PackageCheck className="size-3.5" />
                          {t("catalogInstall.alreadyThere")}
                        </span>
                      ) : running ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("catalogInstall.running")}
                        </span>
                      ) : fit === "missing" ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("catalogInstall.noVersion")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2.5 text-xs"
                          disabled={busy !== null || fit === "checking"}
                          onClick={() => void install(instance)}
                        >
                          {busy === key || fit === "checking" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Download className="size-3.5" />
                          )}
                          {t("catalogInstall.install")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
