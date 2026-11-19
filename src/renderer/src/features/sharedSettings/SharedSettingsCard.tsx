import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SHARED_GROUPS,
  type SharedGroup,
  type SharedInstanceChoice,
  type SharedInstanceRef,
  type SharedInstanceStatus,
} from "@/types/SharedSettings";
import type { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";

const api = window.api;

export function sharedRefOf(instance: Version): SharedInstanceRef {
  return {
    versionPath: instance.versionPath,
    mcVersion: instance.version.version.id,
    loader: instance.version.loader.name,
    shareCode: instance.version.shareCode || undefined,
  };
}

export function SharedSettingsCard({
  instance,
  disabled,
}: {
  instance: Version;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SharedInstanceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useMemo(
    () => sharedRefOf(instance),
    [
      instance.versionPath,
      instance.version.version.id,
      instance.version.loader.name,
      instance.version.shareCode,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    void api.sharedSettings
      .status(ref)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus({
          connected: false,
          pending: false,
          off: [],
          blocked: {},
          hasBackup: false,
        });
        showFailureToast(t("sharedSettings.failed"), error, {
          channels: ["sharedSettings:status"],
        });
      });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  const locked = disabled || busy || !status;
  const groupName = (group: SharedGroup) => t(`sharedSettings.groups.${group}`);

  const configure = async (
    choice: SharedInstanceChoice,
    toastTitle?: string,
  ): Promise<void> => {
    const previous = status;
    setBusy(true);
    try {
      const next = await api.sharedSettings.configure(ref, choice);
      if (!next) throw new Error("shared settings were not changed");
      setStatus(next);
      if (toastTitle && previous) {
        showUndoToast(toastTitle, () =>
          configure({ connected: previous.connected, off: previous.off }),
        );
      }
    } catch (error) {
      showFailureToast(t("sharedSettings.failed"), error, {
        channels: ["sharedSettings:configure"],
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = (group: SharedGroup, on: boolean) => {
    if (!status) return;
    const off = on
      ? status.off.filter((item) => item !== group)
      : [...status.off, group];
    void configure(
      { connected: true, off },
      t(on ? "sharedSettings.groupOn" : "sharedSettings.groupOff", {
        group: groupName(group),
      }),
    );
  };

  const connected = status?.connected === true;

  return (
    <SectionCard
      title={t("sharedSettings.title")}
      icon={Layers}
      className="shrink-0"
      action={
        connected ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={locked}
            className="h-6 px-2 text-2xs text-faint"
            onClick={() =>
              void configure(
                { connected: false, off: status?.off ?? [] },
                t("sharedSettings.disconnected"),
              )
            }
          >
            {t("sharedSettings.disconnect")}
          </Button>
        ) : undefined
      }
    >
      {!status ? (
        <div className="h-[88px]" aria-busy="true" />
      ) : connected ? (
        <div className="flex flex-col pb-1">
          <div className="grid grid-cols-2 gap-x-4 px-3 pt-1">
            {SHARED_GROUPS.map((group) => {
              const blocked = status.blocked[group];
              const on = !blocked && !status.off.includes(group);
              const label = groupName(group);
              return (
                <div
                  key={group}
                  className="flex h-8 min-w-0 items-center gap-2"
                >
                  <Hint
                    content={
                      <div className="flex max-w-72 flex-col gap-0.5">
                        <span className="font-medium">{label}</span>
                        <span>
                          {blocked
                            ? t(`sharedSettings.blocked.${blocked}`)
                            : t(`sharedSettings.groupHints.${group}`)}
                        </span>
                      </div>
                    }
                    variant="text"
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        on ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                  </Hint>
                  <Switch
                    size="sm"
                    aria-label={label}
                    checked={on}
                    disabled={locked || Boolean(blocked)}
                    onCheckedChange={(next) => toggleGroup(group, next)}
                  />
                </div>
              );
            })}
          </div>
          {status.pending && (
            <p className="px-3 pt-0.5 text-2xs text-faint">
              {t("sharedSettings.pending")}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-2xs leading-snug text-faint">
            {t("sharedSettings.offHint")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={locked}
            className="h-7 shrink-0"
            onClick={() =>
              void configure(
                { connected: true, off: [] },
                t("sharedSettings.connected"),
              )
            }
          >
            {t("sharedSettings.connect")}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
