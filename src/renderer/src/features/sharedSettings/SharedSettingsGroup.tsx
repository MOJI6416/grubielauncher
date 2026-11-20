import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { SharedOverview } from "@/types/SharedSettings";
import { versionsAtom } from "@renderer/stores/atoms";
import {
  SettingRow,
  SettingsGroup,
} from "@renderer/features/settings/SettingsPrimitives";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";
import { sharedRefOf } from "./SharedSettingsCard";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export function SharedSettingsGroup({ query }: { query: string }) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const [overview, setOverview] = useState<SharedOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const paths = useMemo(
    () => versions.map((version) => version.versionPath),
    [versions],
  );

  const load = () =>
    api.sharedSettings
      .overview(paths)
      .then(setOverview)
      .catch((error) =>
        showFailureToast(t("sharedSettings.failed"), error, {
          channels: ["sharedSettings:overview"],
        }),
      );

  useEffect(() => {
    void load();
  }, [paths]);

  const connected = new Set(overview?.connected ?? []);
  const rest = versions.filter(
    (version) => !connected.has(version.versionPath),
  );
  const profile = overview?.profile;

  const setAuto = (value: boolean) => {
    countFeature("sharedSettings.auto");
    setBusy(true);
    void api.sharedSettings
      .setAutoConnect(value)
      .then((summary) => {
        if (!summary) throw new Error("auto connect was not saved");
        setOverview((current) =>
          current ? { ...current, profile: summary } : current,
        );
      })
      .catch((error) =>
        showFailureToast(t("sharedSettings.failed"), error, {
          channels: ["sharedSettings:setAutoConnect"],
        }),
      )
      .finally(() => setBusy(false));
  };

  const setConnected = async (targets: typeof versions, value: boolean) => {
    setBusy(true);
    const done: typeof versions = [];
    let failure: unknown;
    for (const version of targets) {
      try {
        const status = await api.sharedSettings.configure(
          sharedRefOf(version),
          {
            connected: value,
            off: [],
          },
        );
        if (status && status.connected === value) done.push(version);
      } catch (error) {
        failure = error;
      }
    }
    await load();
    setBusy(false);
    return { done, failure };
  };

  const connectRest = async () => {
    countFeature("sharedSettings.connectAll");
    const { done, failure } = await setConnected(rest, true);
    const failed = rest.length - done.length;
    if (failed > 0) {
      showFailureToast(
        t("sharedSettings.connectedPartly", { count: failed }),
        failure,
        {
          channels: ["sharedSettings:configure"],
        },
      );
    }
    if (done.length > 0) {
      showUndoToast(
        t("sharedSettings.connectedMany", { count: done.length }),
        () => setConnected(done, false).then(() => undefined),
      );
    }
  };

  const contents = profile
    ? [
        profile.options > 0 &&
          t("sharedSettings.summary.options", { count: profile.options }),
        profile.servers > 0 &&
          t("sharedSettings.summary.servers", { count: profile.servers }),
        profile.packs > 0 &&
          t("sharedSettings.summary.packs", { count: profile.packs }),
        profile.hotbars && t("sharedSettings.summary.hotbars"),
        profile.history > 0 &&
          t("sharedSettings.summary.history", { count: profile.history }),
      ].filter((part): part is string => typeof part === "string")
    : [];

  return (
    <SettingsGroup
      title={t("settings.index.sharedGameSettings.title")}
      hint={t("sharedSettings.settingsHint")}
    >
      <SettingRow
        htmlFor="settings-shared-auto"
        title={t("sharedSettings.autoConnect")}
        description={t("sharedSettings.autoConnectDescription")}
        query={query}
        control={
          <Switch
            id="settings-shared-auto"
            disabled={!profile || busy}
            checked={profile?.autoConnect ?? true}
            onCheckedChange={setAuto}
          />
        }
      />
      <SettingRow
        title={t("sharedSettings.connectedCount", {
          connected: connected.size,
          total: versions.length,
        })}
        description={
          contents.length
            ? t("sharedSettings.summary.title", { list: contents.join(", ") })
            : t("sharedSettings.summary.empty")
        }
        query={query}
        control={
          rest.length > 0 && overview ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void connectRest()}
            >
              {t("sharedSettings.connectRest", { count: rest.length })}
            </Button>
          ) : undefined
        }
      />
    </SettingsGroup>
  );
}
