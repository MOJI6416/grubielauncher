import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { IProject, ProjectType, Provider } from "@/types/ModManager";
import { Hint } from "@renderer/components/Hint";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { pickModpackVersion } from "@renderer/features/catalogInstall/installToInstance";
import { openNewInstance } from "./newInstance";

const api = window.api;

const POPULAR_COUNT = 3;

type Status = "loading" | "ready" | "failed";

export function PopularModpacks({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<IProject[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void api.modManager
      .search(
        "",
        Provider.MODRINTH,
        {
          version: undefined,
          loader: undefined,
          projectType: ProjectType.MODPACK,
          sort: "Downloads",
          filter: [],
        },
        { offset: 0, limit: POPULAR_COUNT },
      )
      .catch(ignoreFailure)
      .then((data) => {
        if (cancelled) return;
        const found = data?.projects?.slice(0, POPULAR_COUNT) ?? [];
        setProjects(found);
        setStatus(found.length > 0 ? "ready" : "failed");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const open = async (project: IProject) => {
    if (openingId) return;
    setOpeningId(project.id);

    try {
      const versions = await api.modManager.getVersions(
        project.provider,
        project.id,
        { projectType: ProjectType.MODPACK, modUrl: project.url },
      );
      const version = pickModpackVersion(versions ?? []);
      if (!version) throw new Error(`No versions for ${project.id}`);

      openNewInstance({ catalogPack: { project, version } });
    } catch (error) {
      showFailureToast(t("home.popular.failed"), error, {
        channels: ["modManager:getVersions"],
      });
    } finally {
      setOpeningId(null);
    }
  };

  if (status === "failed") return null;

  return (
    <div className={cn("flex w-full max-w-2xl flex-col gap-2", className)}>
      <span className="flex items-center gap-1.5 text-3xs font-semibold tracking-[0.09em] text-faint uppercase">
        {t("home.popular.title")}
        <ContentProviderIcon provider={Provider.MODRINTH} className="size-3" />
      </span>

      <div className="grid grid-cols-3 gap-2">
        {status === "loading"
          ? Array.from({ length: POPULAR_COUNT }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))
          : projects.map((project) => {
              const downloads = formatCompactNumber(project.stats?.downloads);
              const isOpening = openingId === project.id;

              return (
                <Hint
                  key={project.id}
                  variant="text"
                  content={
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{project.title}</span>
                      {project.description && (
                        <span>{project.description}</span>
                      )}
                    </span>
                  }
                >
                  <button
                    type="button"
                    disabled={!!openingId}
                    onClick={() => void open(project)}
                    className="flex h-16 min-w-0 items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 text-left transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3">
                      {isOpening ? (
                        <Loader2 className="size-4 animate-spin text-faint" />
                      ) : project.iconUrl ? (
                        <img
                          src={project.iconUrl}
                          alt=""
                          draggable={false}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-4 text-faint" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {project.title}
                      </span>
                      {downloads && (
                        <span className="flex items-center gap-1 font-mono text-2xs text-faint tabular-nums">
                          <Download className="size-3 shrink-0" />
                          {downloads}
                        </span>
                      )}
                    </span>
                  </button>
                </Hint>
              );
            })}
      </div>
    </div>
  );
}
