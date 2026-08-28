import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, PackagePlus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

export function Onboarding() {
  const [accounts] = useAtom(accountsAtom);
  const [versions] = useAtom(versionsAtom);
  const [versionsLoaded] = useAtom(versionsLoadedAtom);
  const [paths] = useAtom(pathsAtom);
  const { t } = useTranslation();

  const [dismissed, setDismissed] = useState<boolean | null>(null);

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

  if (dismissed !== false || !versionsLoaded || completed) return null;

  const steps = [
    {
      id: "account",
      done: hasAccount,
      icon: <UserPlus className="size-4" />,
      title: t("onboarding.stepAccount"),
      description: t("onboarding.stepAccountDescription"),
      locked: false,
      action: () => {
        setDismissed(true);
        openAddAccount();
      },
    },
    {
      id: "version",
      done: hasVersion,
      icon: <PackagePlus className="size-4" />,
      title: t("onboarding.stepVersion"),
      description: t("onboarding.stepVersionDescription"),
      locked: !hasAccount,
      action: () => {
        setDismissed(true);
        openNewInstance();
      },
    },
  ];

  const activeIndex = steps.findIndex((step) => !step.done);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="gap-1.5 border-b border-border px-5 py-4 pr-12">
          <BrandMark className="size-5 text-foreground" />
          <DialogTitle className="pr-0 text-base leading-5">
            {t("onboarding.title")}
          </DialogTitle>
          <p className="text-xs leading-4 text-muted-foreground">
            {t("onboarding.description")}
          </p>
        </DialogHeader>

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
                    </span>
                  </Hint>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {step.locked
                      ? t("onboarding.stepVersionLocked")
                      : step.description}
                  </span>
                </div>

                {!step.done && (
                  <Button
                    size="sm"
                    variant={isActive ? "default" : "secondary"}
                    disabled={step.locked}
                    onClick={step.action}
                  >
                    {t("onboarding.go")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-5 py-3">
          <p className="min-w-0 text-xs leading-4 text-faint">
            {t("onboarding.skipHint")}
          </p>
          <Button variant="ghost" onClick={finish}>
            {t("onboarding.skip")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
