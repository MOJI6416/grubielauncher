import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { FolderInput, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isRunningAtom } from "@renderer/stores/atoms";
import { formatBytes } from "@renderer/utilities/file";
import type { DataLocationInfo, DataLocationPlan } from "@/types/DataLocation";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import { PathRows, PathText } from "../dataLocation/PathRows";

const api = window.api;

type ReadyPlan = Exclude<DataLocationPlan, { kind: "error" }>;

export function DataLocationGroup({ query }: { query: string }) {
  const { t } = useTranslation();
  const isRunning = useAtomValue(isRunningAtom);
  const [info, setInfo] = useState<DataLocationInfo | null>(null);
  const [checking, setChecking] = useState<"pick" | "default" | null>(null);
  const [plan, setPlan] = useState<ReadyPlan | null>(null);
  const [applying, setApplying] = useState(false);

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const bytes = (value: number) => formatBytes(value, sizes, 1);

  useEffect(() => {
    void api.dataLocation.get().then(setInfo);
  }, []);

  const choose = async (source: "pick" | "default") => {
    setChecking(source);
    try {
      const next =
        source === "pick"
          ? await api.dataLocation.pick()
          : await api.dataLocation.planDefault();
      if (!next) return;

      if (next.kind === "error") {
        toast.error(
          t(`dataLocation.problems.${next.problem}`, {
            size: bytes(next.bytes ?? 0),
            free: bytes(next.freeBytes ?? 0),
          }),
        );
        return;
      }

      setPlan(next);
    } catch {
      toast.error(t("dataLocation.problems.failed"));
    } finally {
      setChecking(null);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setApplying(true);

    try {
      const result = await api.dataLocation.apply(plan.kind);
      if (result.ok) return;
      toast.error(t(`dataLocation.problems.${result.problem}`));
    } catch {
      toast.error(t("dataLocation.problems.failed"));
    }

    setApplying(false);
    setPlan(null);
  };

  const busy = checking !== null || applying || isRunning;

  return (
    <>
      <SettingsGroup>
        <SettingRow
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
              path={info?.root || "…"}
              className="flex-1 text-xs text-faint"
            />
            {info?.isDefault ? (
              <span className="shrink-0 text-[0.7rem] text-faint">
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
          {isRunning && (
            <p className="mt-1.5 text-[0.7rem] leading-snug text-warning">
              {t("dataLocation.problems.busy")}
            </p>
          )}
        </SettingRow>
      </SettingsGroup>

      <AlertDialog
        open={plan !== null}
        onOpenChange={(open) => !open && !applying && setPlan(null)}
      >
        <AlertDialogContent>
          {plan && info && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {plan.kind === "move"
                    ? t("settings.dataLocation.moveTitle")
                    : t("settings.dataLocation.adoptTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {plan.kind === "move"
                    ? t("settings.dataLocation.moveDescription")
                    : t("settings.dataLocation.adoptDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <PathRows
                rows={[
                  {
                    label:
                      plan.kind === "move"
                        ? t("dataLocation.from")
                        : t("dataLocation.current"),
                    path: info.root,
                  },
                  {
                    label:
                      plan.kind === "move"
                        ? t("dataLocation.to")
                        : t("dataLocation.next"),
                    path: plan.target,
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

              <AlertDialogFooter>
                <AlertDialogCancel disabled={applying}>
                  {t("common.cancel")}
                </AlertDialogCancel>
                <Button disabled={applying} onClick={() => void apply()}>
                  {applying && <Loader2 className="animate-spin" />}
                  {applying
                    ? t("settings.dataLocation.restarting")
                    : plan.kind === "move"
                      ? t("settings.dataLocation.moveConfirm")
                      : t("settings.dataLocation.adoptConfirm")}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
