import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, PackagePlus, Rocket, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  accountsAtom,
  accountsModalAtom,
  addVersionModalAtom,
  pathsAtom,
  versionsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import {
  readLauncherState,
  writeLauncherState,
} from "@renderer/utilities/launcherState";

export function Onboarding() {
  const [accounts] = useAtom(accountsAtom);
  const [versions] = useAtom(versionsAtom);
  const [versionsLoaded] = useAtom(versionsLoadedAtom);
  const [paths] = useAtom(pathsAtom);
  const setAccountsModalOpen = useAtom(accountsModalAtom)[1];
  const setAddVersionOpen = useAtom(addVersionModalAtom)[1];
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
      action: () => setAccountsModalOpen(true),
    },
    {
      id: "version",
      done: hasVersion,
      icon: <PackagePlus className="size-4" />,
      title: t("onboarding.stepVersion"),
      description: t("onboarding.stepVersionDescription"),
      action: () => setAddVersionOpen(true),
      disabled: !hasAccount,
    },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-5" />
            {t("onboarding.title")}
          </DialogTitle>
          <DialogDescription>{t("onboarding.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                {step.done ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  step.icon
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {index + 1}. {step.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
              {!step.done && (
                <Button
                  size="sm"
                  disabled={step.disabled}
                  onClick={step.action}
                >
                  {t("onboarding.go")}
                </Button>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={finish}>
            {t("onboarding.skip")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
