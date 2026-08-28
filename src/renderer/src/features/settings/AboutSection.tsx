import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  ClipboardCopy,
  ExternalLink,
  Heart,
  Loader2,
  Sparkles,
} from "lucide-react";
import { FaDiscord } from "react-icons/fa";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_URL } from "@/shared/config";
import { pathsAtom, versionsAtom } from "@renderer/stores/atoms";
import { mirrorModeAtom } from "@renderer/features/install/installUi";
import { MilestoneBeam } from "@renderer/components/MilestoneBeam";
import { isMilestoneRelease } from "@renderer/features/whatsNew/milestone";
import { useCurrentRelease } from "@renderer/features/whatsNew/useCurrentRelease";
import { whatsNewLoadingAtom } from "@renderer/features/whatsNew/whatsNewStore";
import type { TSettings } from "@/types/Settings";
import { PathRow, SettingRow, SettingsGroup } from "./SettingsPrimitives";
import { ReleaseHistory } from "./ReleaseHistory";
import { buildSystemReport, platformName } from "./systemReport";
import type { SettingsEntryId } from "./catalog";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

const DISCORD_URL = "https://discord.gg/URrKha9hk7";

export function AboutSection({
  settings,
  appVersion,
  totalMemoryMb,
  storageTotal,
  onShowWhatsNew,
  visible,
  query,
}: {
  settings: TSettings;
  appVersion: string;
  totalMemoryMb: number;
  storageTotal: string;
  onShowWhatsNew?: () => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
}) {
  const { t, i18n } = useTranslation();
  const isMilestone = isMilestoneRelease(useCurrentRelease());
  const paths = useAtomValue(pathsAtom);
  const versions = useAtomValue(versionsAtom);
  const isWhatsNewLoading = useAtomValue(whatsNewLoadingAtom);
  const mirrorMode = useAtomValue(mirrorModeAtom);

  const open = (url: string) => {
    void api.shell.openExternal(url).catch(() => undefined);
  };

  const copyReport = async () => {
    const copied = await copyToClipboard(
      buildSystemReport({
        appVersion,
        platform: api.platform,
        totalMemoryMb,
        xmx: settings.xmx,
        optimizedJvm: settings.optimizedJvm,
        downloadSource: settings.downloadSource,
        mirrorMode,
        language: settings.lang,
        instanceCount: versions.length,
        launcherPath: paths.launcher,
        minecraftPath: paths.minecraft,
        javaPath: paths.java,
        storageTotal,
      }),
    );
    if (!copied) return;
    toast.success(t("common.copied"));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Grubie Launcher</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-faint">
            {!appVersion ? (
              <Skeleton className="h-3 w-12" />
            ) : isMilestone ? (
              <span className="relative flex h-5 shrink-0 items-center gap-1.5 rounded-md bg-primary-soft px-2 text-foreground">
                <MilestoneBeam />
                <span className="font-mono tabular-nums">{appVersion}</span>
                <span className="text-[0.6rem] font-medium tracking-wide uppercase">
                  {t("whatsNew.milestone")}
                </span>
              </span>
            ) : (
              <span className="font-mono tabular-nums">{appVersion}</span>
            )}
            <span>·</span>
            <span>{platformName(api.platform)}</span>
            {totalMemoryMb > 0 && (
              <>
                <span>·</span>
                <span className="font-mono tabular-nums">
                  {(totalMemoryMb / 1024).toFixed(0)} {t("settings.game.gb")}
                </span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isWhatsNewLoading}
          onClick={onShowWhatsNew}
        >
          {isWhatsNewLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {t("settings.about.whatsNew")}
        </Button>
      </div>

      {visible("folders") && (
        <SettingsGroup
          title={t("settings.folders.title")}
          hint={t("settings.folders.description")}
        >
          <PathRow
            label={t("settings.folders.launcher")}
            path={paths.launcher}
            onOpen={() => void api.shell.openPath(paths.launcher)}
          />
          <PathRow
            label={t("settings.folders.minecraft")}
            path={paths.minecraft}
            onOpen={() => void api.shell.openPath(paths.minecraft)}
          />
          <PathRow
            label={t("settings.folders.java")}
            path={paths.java}
            onOpen={() => void api.shell.openPath(paths.java)}
          />
        </SettingsGroup>
      )}

      {visible("systemReport") && (
        <SettingsGroup title={t("settings.about.supportTitle")}>
          <SettingRow
            title={t("settings.about.copyReport")}
            description={t("settings.about.copyReportDescription")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void copyReport()}
              >
                <ClipboardCopy className="size-3.5" />
                {t("common.copy")}
              </Button>
            }
          />
          <SettingRow
            title={t("settings.connectivity.statusPage")}
            description={t("settings.about.statusDescription")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => open(STATUS_URL)}
              >
                <ExternalLink className="size-3.5" />
                {t("settings.about.openLink")}
              </Button>
            }
          />
        </SettingsGroup>
      )}

      {visible("links") && (
        <SettingsGroup title={t("settings.about.communityTitle")}>
          <SettingRow
            title="Discord"
            description={t("settings.about.discordDescription")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => open(DISCORD_URL)}
              >
                <FaDiscord className="size-3.5" />
                {t("settings.about.openLink")}
              </Button>
            }
          />
          <SettingRow
            title={t("settings.support")}
            description={t("settings.about.donateDescription")}
            query={query}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  open(`https://grubielauncher.com/${i18n.language}/donate`)
                }
              >
                <Heart className="size-3.5" />
                {t("settings.about.openLink")}
              </Button>
            }
          />
        </SettingsGroup>
      )}

      {visible("releaseHistory") && <ReleaseHistory appVersion={appVersion} />}
    </div>
  );
}
