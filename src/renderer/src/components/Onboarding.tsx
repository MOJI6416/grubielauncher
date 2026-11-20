import { useAtom } from "jotai";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  FolderInput,
  HardDrive,
  Loader2,
  PackagePlus,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Hint } from "./Hint";
import {
  accountsAtom,
  pathsAtom,
  versionsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { openAddAccount } from "@renderer/features/accounts/addAccountRequest";
import {
  readLauncherState,
  writeLauncherState,
} from "@renderer/utilities/launcherState";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { BrandMark } from "@renderer/shell/BrandMark";
import { useDataLocationChooser } from "@renderer/features/dataLocation/useDataLocationChooser";
import { PathRows, PathText } from "@renderer/features/dataLocation/PathRows";
import { useRedact } from "@renderer/features/streamer/streamerMode";

const LOW_SPACE_BYTES = 20 * 1024 ** 3;

type AwayStep = "account" | "version";

interface Step {
  id: string;
  done: boolean;
  optional?: boolean;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  locked: boolean;
  actionLabel: string;
  busy?: boolean;
  action: () => void;
}

export function Onboarding() {
  const [accounts] = useAtom(accountsAtom);
  const [versions] = useAtom(versionsAtom);
  const [versionsLoaded] = useAtom(versionsLoadedAtom);
  const [paths] = useAtom(pathsAtom);
  const { t } = useTranslation();
  const redact = useRedact();
  const data = useDataLocationChooser();

  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [away, setAway] = useState<AwayStep | null>(null);

  const hasAccount = (accounts?.length ?? 0) > 0;
  const hasVersion = versions.length > 0;
  const completed = hasAccount && hasVersion;

  useEffect(() => {
    if (!paths.launcher) return;

    let cancelled = false;
    void readLauncherState(paths.launcher).then((state) => {
      if (!cancelled) setDismissed(!!state?.onboardingDone);
    });

    return () => {
      cancelled = true;
    };
  }, [paths.launcher]);

  useEffect(() => {
    if (away === "account" && hasAccount) setAway(null);
  }, [away, hasAccount]);

  const finish = () => {
    setDismissed(true);

    const launcherPath = paths.launcher;
    if (!launcherPath) return;
    void readLauncherState(launcherPath).then((state) =>
      writeLauncherState(launcherPath, {
        ...(state || {}),
        onboardingDone: true,
      }),
    );
  };

  useEffect(() => {
    if (!versionsLoaded || dismissed !== false || !completed) return;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, dismissed, versionsLoaded]);

  if (dismissed !== false || !versionsLoaded || completed || away) return null;

  const info = data.info;
  const freeBytes = info?.freeBytes ?? null;
  const lowSpace = freeBytes !== null && freeBytes < LOW_SPACE_BYTES;
  const plan = data.plan;

  const steps: Step[] = [
    {
      id: "account",
      done: hasAccount,
      icon: <UserPlus className="size-4" />,
      title: t("onboarding.stepAccount"),
      description: t("onboarding.stepAccountDescription"),
      locked: false,
      actionLabel: t("onboarding.go"),
      action: () => {
        setAway("account");
        openAddAccount();
      },
    },
    {
      id: "data",
      done: Boolean(info && !info.isDefault),
      optional: true,
      icon: <HardDrive className="size-4" />,
      title: t("onboarding.stepData"),
      description: (
        <span className="grid min-w-0 gap-0.5">
          <PathText
            path={info?.root ? redact.path(info.root) : "…"}
            className="text-2xs text-faint"
          />
          <span className={cn(lowSpace && "text-warning")}>
            {freeBytes === null
              ? t("onboarding.stepDataDescription")
              : t(
                  lowSpace ? "onboarding.stepDataLow" : "onboarding.stepDataFree",
                  { free: data.bytes(freeBytes) },
                )}
          </span>
        </span>
      ),
      locked: !info,
      actionLabel: t("onboarding.stepDataChange"),
      busy: data.checking === "pick",
      action: () => void data.choose("pick"),
    },
    {
      id: "version",
      done: hasVersion,
      icon: <PackagePlus className="size-4" />,
      title: t("onboarding.stepVersion"),
      description: hasAccount
        ? t("onboarding.stepVersionDescription")
        : t("onboarding.stepVersionLocked"),
      locked: !hasAccount,
      actionLabel: t("onboarding.go"),
      action: () => {
        setAway("version");
        openNewInstance();
      },
    },
  ];

  const activeIndex = steps.findIndex((step) => !step.done && !step.optional);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !data.applying) setDismissed(true);
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="gap-1.5 border-b border-border px-5 py-4 pr-12">
          <BrandMark className="size-5 text-foreground" />
          <DialogTitle className="pr-0 text-base leading-5">
            {plan
              ? plan.kind === "move"
                ? t("settings.dataLocation.moveTitle")
                : t("settings.dataLocation.adoptQuestion")
              : t("onboarding.title")}
          </DialogTitle>
          <p className="text-xs leading-4 text-muted-foreground">
            {plan
              ? plan.kind === "move"
                ? t("settings.dataLocation.moveDescription")
                : t("settings.dataLocation.adoptDescription")
              : t("onboarding.description")}
          </p>
        </DialogHeader>

        {plan && info ? (
          <div className="grid min-w-0 gap-3 px-5 py-4">
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
                        size: data.bytes(plan.bytes),
                      })
                    : t("settings.dataLocation.moveSize", {
                        size: data.bytes(plan.bytes),
                        free: data.bytes(plan.freeBytes),
                      })}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-2 px-5 py-4">
            {steps.map((step, index) => {
              const isActive = index === activeIndex;

              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary-soft-raised"
                      : "border-border bg-surface-2",
                    step.locked && "opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      step.done
                        ? "bg-success/12 text-success"
                        : "bg-surface-3 text-muted-foreground",
                    )}
                  >
                    {step.done ? <Check className="size-4" /> : step.icon}
                  </span>

                  <div className="grid min-w-0 flex-1">
                    <Hint content={step.title} variant="text" truncatedOnly>
                      <span className="truncate text-sm">
                        {index + 1}. {step.title}
                        {step.optional && (
                          <span className="ml-1.5 text-2xs text-faint">
                            {t("onboarding.optional")}
                          </span>
                        )}
                      </span>
                    </Hint>
                    <span className="min-w-0 text-xs leading-4 text-muted-foreground">
                      {step.description}
                    </span>
                  </div>

                  {(!step.done || step.optional) && (
                    <Button
                      size="sm"
                      variant={isActive ? "default" : "secondary"}
                      disabled={step.locked || step.busy}
                      onClick={step.action}
                    >
                      {step.busy ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        step.optional && <FolderInput />
                      )}
                      {step.actionLabel}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="m-0 flex-row items-center justify-between gap-2 border-border px-5 py-3 sm:justify-between">
          {plan ? (
            <>
              <Button
                variant="ghost"
                disabled={data.applying}
                onClick={data.cancel}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={data.applying} onClick={() => void data.apply()}>
                {data.applying && <Loader2 className="animate-spin" />}
                {data.applying
                  ? t("settings.dataLocation.restarting")
                  : plan.kind === "move"
                    ? t("settings.dataLocation.moveConfirm")
                    : t("settings.dataLocation.adoptConfirm")}
              </Button>
            </>
          ) : (
            <>
              <p className="min-w-0 text-xs leading-4 text-faint">
                {t("onboarding.skipHint")}
              </p>
              <Button variant="ghost" onClick={finish}>
                {t("onboarding.skip")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
