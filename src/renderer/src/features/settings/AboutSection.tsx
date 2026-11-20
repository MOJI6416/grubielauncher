import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { Gift, Heart, Loader2 } from "lucide-react";
import { FaDiscord } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { showFailureToast } from "@renderer/utilities/failures";
import { MilestoneBeam } from "@renderer/components/MilestoneBeam";
import { isMilestoneRelease } from "@renderer/features/whatsNew/milestone";
import { useCurrentRelease } from "@renderer/features/whatsNew/useCurrentRelease";
import { whatsNewLoadingAtom } from "@renderer/features/whatsNew/whatsNewStore";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import { ReleaseHistory } from "./ReleaseHistory";
import { platformName } from "./systemReport";
import type { SettingsEntryId } from "./catalog";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

const DISCORD_URL = "https://discord.gg/URrKha9hk7";

export function AboutSection({
  appVersion,
  totalMemoryMb,
  onShowWhatsNew,
  visible,
  query,
}: {
  appVersion: string;
  totalMemoryMb: number;
  onShowWhatsNew?: () => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
}) {
  const { t, i18n } = useTranslation();
  const isMilestone = isMilestoneRelease(useCurrentRelease());
  const isWhatsNewLoading = useAtomValue(whatsNewLoadingAtom);

  const open = (url: string) => {
    void api.shell.openExternal(url).catch((error) =>
      showFailureToast(t("settings.about.openLinkFailed"), error, {
        channels: ["shell:openExternal"],
      }),
    );
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
                <span className="text-3xs font-medium tracking-wide uppercase">
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
          onClick={() => {
            countFeature("whatsNew.open");
            onShowWhatsNew?.();
          }}
        >
          {isWhatsNewLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Gift className="size-3.5" />
          )}
          {t("settings.about.whatsNew")}
        </Button>
      </div>

      {visible("links") && (
        <SettingsGroup entry="links" title={t("settings.about.communityTitle")}>
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
