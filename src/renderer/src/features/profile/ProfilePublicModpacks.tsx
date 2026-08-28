import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  AlertTriangle,
  Boxes,
  EyeOff,
  HardDriveDownload,
  ListChecks,
  Loader2,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IModpack, IModpackCard } from "@/types/Backend";
import { networkAtom, settingsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { CommunityPackCard } from "@renderer/features/community/CommunityPackCard";
import { useInstalledShareCodes } from "@renderer/features/community/installedPacks";
import { usePackInstall } from "@renderer/features/community/usePackInstall";

export function ProfilePublicModpacks({
  nickname,
  packs,
  isLoading,
  isError,
  isHidden,
  onRetry,
}: {
  nickname: string;
  packs: IModpackCard[];
  isLoading: boolean;
  isError: boolean;
  isHidden?: boolean;
  onRetry?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const installed = useInstalledShareCodes();

  const onResolved = useCallback((modpack: IModpack) => {
    openNewInstance({ modpack, source: "community" });
  }, []);

  const { busyId, install } = usePackInstall(onResolved);

  const language = settings.lang || "en";
  const totalDownloads = packs.reduce(
    (sum, pack) => sum + (pack.downloads || 0),
    0,
  );
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
        <header className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-muted-foreground">
            <Boxes className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {t("profile.publicModpacks", { nickname })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t("ownModpacks.totalDownloads", {
                value:
                  isError || isHidden ? "—" : formatNumber(totalDownloads),
              })}
            </p>
          </div>
        </header>

        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : isHidden ? (
            <EmptyState icon={EyeOff} text={t("profile.publicProfileHidden")} />
          ) : !isBackendOnline || isError ? (
            <EmptyState
              icon={AlertTriangle}
              text={
                isBackendOnline
                  ? t("profile.publicModpacksError")
                  : t("app.backendUnavailable")
              }
              action={
                isBackendOnline && onRetry ? (
                  <Button variant="secondary" size="sm" onClick={onRetry}>
                    {t("common.retry")}
                  </Button>
                ) : undefined
              }
            />
          ) : packs.length === 0 ? (
            <EmptyState icon={Boxes} text={t("profile.publicModpacksEmpty")} />
          ) : (
            <div className="grid content-start gap-1.5">
              {packs.map((pack) => {
                const instanceKey = installed.get(pack.id);

                return (
                  <CommunityPackCard
                    key={pack.id}
                    pack={pack}
                    language={language}
                    isInstalled={Boolean(instanceKey)}
                    action={
                      instanceKey ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate({ name: "instance", id: instanceKey })
                          }
                        >
                          {t("versions.openInstance")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId !== null || !isBackendOnline}
                          onClick={() => void install(pack.id)}
                        >
                          {busyId === pack.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <HardDriveDownload />
                          )}
                          {t("common.install")}
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      <InstallHints />
    </div>
  );
}

function InstallHints() {
  const { t } = useTranslation();
  const steps = [
    { icon: PackageCheck, text: t("profile.publicModpacksHint1") },
    { icon: RefreshCw, text: t("profile.publicModpacksHint2") },
    { icon: ListChecks, text: t("profile.publicModpacksHint3") },
  ];

  return (
    <section className="shrink-0 rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step) => (
          <div
            key={step.text}
            className="flex min-w-0 items-start gap-2 rounded-lg bg-surface-1 p-2"
          >
            <step.icon className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <p className="min-w-0 text-[11px] leading-snug text-muted-foreground">
              {step.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({
  icon: Icon,
  text,
  action,
}: {
  icon: typeof Boxes;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 text-center">
      <Icon className="size-6 text-faint" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
