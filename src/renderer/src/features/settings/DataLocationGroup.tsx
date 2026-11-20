import { useTranslation } from "react-i18next";
import { FolderInput, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { LockedNote, SettingRow, SettingsGroup } from "./SettingsPrimitives";
import { PathRows, PathText } from "../dataLocation/PathRows";
import { useDataLocationChooser } from "../dataLocation/useDataLocationChooser";
import { useRedact } from "../streamer/streamerMode";
import { useGameLock } from "./gameLock";

export function DataLocationGroup({ query }: { query: string }) {
  const { t } = useTranslation();
  const gameLock = useGameLock();
  const redact = useRedact();
  const { info, checking, plan, applying, choose, apply, cancel, bytes } =
    useDataLocationChooser();

  const busy = checking !== null || applying || gameLock !== null;

  return (
    <>
      <SettingsGroup>
        <SettingRow
          entry="dataLocation"
          title={t("settings.dataLocation.title")}
          description={t("settings.dataLocation.description")}
          query={query}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !info}
              onClick={() => void choose("pick")}
            >
              {checking === "pick" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FolderInput />
              )}
              {checking === "pick"
                ? t("settings.dataLocation.checking")
                : t("settings.dataLocation.move")}
            </Button>
          }
        >
          <div className="flex min-w-0 items-center gap-2">
            <PathText
              path={info?.root ? redact.path(info.root) : "…"}
              className="flex-1 text-xs text-faint"
            />
            {info?.isDefault ? (
              <span className="shrink-0 text-2xs text-faint">
                {t("settings.dataLocation.default")}
              </span>
            ) : (
              info && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void choose("default")}
                  className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {checking === "default" && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  {t("settings.dataLocation.reset")}
                </button>
              )
            )}
          </div>
          {gameLock && (
            <LockedNote
              reason={t("dataLocation.problems.busy")}
              className="mt-1.5"
            />
          )}
        </SettingRow>
      </SettingsGroup>

      {plan && info && (
        <Confirmation
          title={
            plan.kind === "move"
              ? t("settings.dataLocation.moveTitle")
              : t("settings.dataLocation.adoptQuestion")
          }
          onClose={() => !applying && cancel()}
          content={
            plan.kind === "move"
              ? [{ text: t("settings.dataLocation.moveDescription") }]
              : [
                  { text: t("settings.dataLocation.adoptTitle") },
                  { text: t("settings.dataLocation.adoptDescription") },
                ]
          }
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: cancel,
            },
            {
              text: applying
                ? t("settings.dataLocation.restarting")
                : plan.kind === "move"
                  ? t("settings.dataLocation.moveConfirm")
                  : t("settings.dataLocation.adoptConfirm"),
              color: "primary",
              loading: applying,
              onClick: apply,
            },
          ]}
        >
          <PathRows
            rows={[
              {
                label:
                  plan.kind === "move"
                    ? t("dataLocation.from")
                    : t("dataLocation.current"),
                path: redact.path(info.root),
              },
              {
                label:
                  plan.kind === "move"
                    ? t("dataLocation.to")
                    : t("dataLocation.next"),
                path: redact.path(plan.target),
              },
            ]}
          />

          {plan.kind === "move" && (
            <p className="text-xs text-muted-foreground">
              {plan.sameVolume
                ? t("settings.dataLocation.moveSameVolume")
                : plan.freeBytes === null
                  ? t("settings.dataLocation.moveSizeUnknown", {
                      size: bytes(plan.bytes),
                    })
                  : t("settings.dataLocation.moveSize", {
                      size: bytes(plan.bytes),
                      free: bytes(plan.freeBytes),
                    })}
            </p>
          )}
        </Confirmation>
      )}
    </>
  );
}
